import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import puppeteer from 'puppeteer';
import { createCookieNotValidException } from './airtable-cookie-not-valid.exception';
import { plausibleAirtableCookieHeader } from './airtable-cookie.util';
import {
  AirtableWebSession,
  AirtableWebSessionDocument,
} from './schemas/web-session.schema';
import {
  isAirtableVendorLogEnabled,
  logAirtableVendorRequest,
  logAirtableVendorResponse,
  warnAirtableVendorFailure,
} from './airtable-vendor-log';

const SESSION_KEY = 'default';
const COOKIE_AUTO_CAPTURE_POLL_MS = 1200;
type BrowserKind = 'chrome' | 'brave';

@Injectable()
export class AirtableWebSessionService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(AirtableWebSession.name)
    private readonly sessions: Model<AirtableWebSessionDocument>,
  ) {}

  private get webHost(): string {
    return this.config
      .getOrThrow<string>('airtable.webHost')
      .replace(/\/$/, '');
  }

  /** Airtable serves the app on www; apex `airtable.com` redirects and cookie reads differ. */
  private get canonicalAirtableOrigin(): string {
    try {
      const u = new URL(this.webHost);
      if (u.hostname === 'airtable.com') {
        u.hostname = 'www.airtable.com';
      }
      return u.origin;
    } catch {
      return this.webHost;
    }
  }

  private async collectCookiesForPage(page: {
    url: () => string;
    cookies: (...urls: string[]) => Promise<{ name: string; value: string }[]>;
  }): Promise<string> {
    let pageOrigin = '';
    try {
      const u = new URL(page.url());
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        pageOrigin = u.origin;
      }
    } catch {
      // ignore
    }
    const urls = Array.from(
      new Set(
        [
          this.canonicalAirtableOrigin,
          this.webHost,
          pageOrigin,
          'https://www.airtable.com',
          'https://airtable.com',
        ].filter(Boolean),
      ),
    );
    const byName = new Map<string, string>();
    for (const url of urls) {
      try {
        const list = await page.cookies(url);
        for (const c of list) {
          if (c.name) {
            byName.set(c.name, c.value ?? '');
          }
        }
      } catch {
        // ignore bad URL filter
      }
    }
    return [...byName.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
  }

  async getCookieHeader(): Promise<string | null> {
    const doc = await this.sessions.findOne({ key: SESSION_KEY }).lean();
    return doc?.cookieHeader ?? null;
  }

  async setCookieHeader(cookieHeader: string): Promise<void> {
    await this.sessions.findOneAndUpdate(
      { key: SESSION_KEY },
      {
        $set: {
          cookieHeader: cookieHeader.trim(),
          lastValidatedAt: null,
          lastValidationOk: null,
        },
      },
      { upsert: true, new: true },
    );
  }

  private async cloneProfileSnapshot(
    sourceUserDataDir: string,
    profileDirectory: string,
  ): Promise<{ userDataDir: string; cleanup: () => Promise<void> }> {
    const tmpUserDataDir = await mkdtemp(
      path.join(os.tmpdir(), 'airtable-brave-profile-'),
    );

    const localStateSrc = path.join(sourceUserDataDir, 'Local State');
    const localStateDst = path.join(tmpUserDataDir, 'Local State');
    const profileSrc = path.join(sourceUserDataDir, profileDirectory);
    const profileDst = path.join(tmpUserDataDir, profileDirectory);

    // Snapshot the minimum profile data needed for encrypted cookie access.
    await cp(localStateSrc, localStateDst, { force: true });
    await cp(profileSrc, profileDst, { recursive: true, force: true });

    return {
      userDataDir: tmpUserDataDir,
      cleanup: async () => {
        await rm(tmpUserDataDir, { recursive: true, force: true });
      },
    };
  }

  private async detectBraveProfileDirectory(
    sourceUserDataDir: string,
  ): Promise<string> {
    const localStatePath = path.join(sourceUserDataDir, 'Local State');
    try {
      const raw = await readFile(localStatePath, 'utf8');
      const parsed = JSON.parse(raw) as {
        profile?: { last_used?: string };
      };
      const candidate = parsed?.profile?.last_used?.trim();
      if (candidate) {
        return candidate;
      }
      return 'Default';
    } catch {
      return 'Default';
    }
  }

  async autoCaptureCookies(opts?: {
    timeoutMs?: number;
    preloadUrl?: string;
    browser?: BrowserKind;
  }): Promise<{
    valid: boolean;
    cookieLength: number;
    preloadedUrl: string;
    cookieHeader: string;
  }> {
    const timeoutMs = Math.max(10_000, opts?.timeoutMs ?? 180_000);
    const preloadUrl = opts?.preloadUrl?.trim() || this.webHost;
    const browserKind: BrowserKind =
      opts?.browser === 'chrome' ? 'chrome' : 'brave';

    const launchArgs: string[] = [];
    let executablePath: string | undefined;
    let userDataDir: string | undefined;
    let cleanupUserDataDir: (() => Promise<void>) | undefined;
    if (browserKind === 'brave') {
      const sourceUserDataDir =
        process.platform === 'darwin'
          ? `${os.homedir()}/Library/Application Support/BraveSoftware/Brave-Browser`
          : undefined;
      executablePath =
        process.platform === 'darwin'
          ? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
          : undefined;
      if (sourceUserDataDir) {
        const profileDirectory =
          await this.detectBraveProfileDirectory(sourceUserDataDir);
        const snap = await this.cloneProfileSnapshot(
          sourceUserDataDir,
          profileDirectory,
        );
        userDataDir = snap.userDataDir;
        cleanupUserDataDir = snap.cleanup;
        launchArgs.push(`--profile-directory=${profileDirectory}`);
      } else {
        launchArgs.push('--profile-directory=Default');
      }
    }

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      executablePath,
      userDataDir,
      args: launchArgs,
    });

    try {
      const page = await browser.newPage();
      await page.goto(preloadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });

      const startedAt = Date.now();
      let cookieHeader = '';
      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, COOKIE_AUTO_CAPTURE_POLL_MS),
        );
        const currentUrl = page.url();
        if (
          currentUrl.includes('/login') ||
          currentUrl.includes('/signin') ||
          currentUrl.includes('/account')
        ) {
          continue;
        }
        cookieHeader = await this.collectCookiesForPage(page);
        if (plausibleAirtableCookieHeader(cookieHeader)) {
          break;
        }
      }

      if (!plausibleAirtableCookieHeader(cookieHeader)) {
        throw new Error(
          'Could not capture valid Airtable cookies before timeout. Complete the login in the opened browser and retry.',
        );
      }

      const valid = await this.validateCookies(cookieHeader);
      if (!valid) {
        throw createCookieNotValidException();
      }
      await this.setCookieHeader(cookieHeader);
      return {
        valid,
        cookieLength: cookieHeader.length,
        preloadedUrl: preloadUrl,
        cookieHeader,
      };
    } finally {
      await browser.close();
      if (cleanupUserDataDir) {
        await cleanupUserDataDir();
      }
    }
  }

  async getStatus(): Promise<{
    hasSession: boolean;
    lastValidatedAt: string | null;
    lastValidationOk: boolean | null;
  }> {
    const doc = await this.sessions.findOne({ key: SESSION_KEY }).lean();
    return {
      hasSession: Boolean(doc?.cookieHeader),
      lastValidatedAt: doc?.lastValidatedAt?.toISOString() ?? null,
      lastValidationOk: doc?.lastValidationOk ?? null,
    };
  }

  async recordValidationOutcome(ok: boolean): Promise<void> {
    await this.sessions.updateOne(
      { key: SESSION_KEY },
      {
        $set: {
          lastValidatedAt: new Date(),
          lastValidationOk: ok,
        },
      },
    );
  }

  async validateCookies(cookieHeader?: string): Promise<boolean> {
    const header = cookieHeader ?? (await this.getCookieHeader());
    if (!header) {
      return false;
    }
    if (!plausibleAirtableCookieHeader(header)) {
      await this.recordValidationOutcome(false);
      return false;
    }
    const validateUrl = `${this.canonicalAirtableOrigin}/`;
    logAirtableVendorRequest('web', {
      method: 'GET',
      url: validateUrl,
      purpose: 'cookie_validation',
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(validateUrl, {
        headers: {
          Cookie: header,
          Accept: 'text/html',
        },
        redirect: 'manual',
        signal: ctrl.signal,
      });
    } catch {
      await this.recordValidationOutcome(false);
      return false;
    } finally {
      clearTimeout(t);
    }
    const text = await res.text();
    logAirtableVendorResponse('web', {
      url: validateUrl,
      status: res.status,
      bodyLength: text.length,
      ...(isAirtableVendorLogEnabled()
        ? { bodyPreview: text.slice(0, 800) }
        : {}),
    });
    if (!isAirtableVendorLogEnabled() && !res.ok) {
      warnAirtableVendorFailure('web', {
        url: validateUrl,
        status: res.status,
        purpose: 'cookie_validation',
      });
    }
    const loc = res.headers.get('location') ?? '';
    const ok =
      res.status === 200 ||
      (res.status >= 300 &&
        res.status < 400 &&
        !loc.includes('/login') &&
        !loc.includes('signin'));

    await this.recordValidationOutcome(ok);
    return ok;
  }

  /**
   * Ensures stored cookies look valid against Airtable web. Throws {@link createCookieNotValidException} otherwise.
   */
  async ensureValidCookies(): Promise<string> {
    const existing = await this.getCookieHeader();
    if (existing && (await this.validateCookies(existing))) {
      return existing;
    }
    throw createCookieNotValidException({
      hasSession: Boolean(existing),
    });
  }
}
