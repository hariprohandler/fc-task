import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import {
  AirtableWebLoginDraft,
  AirtableWebLoginDraftDocument,
} from './schemas/web-login-draft.schema';
import { plausibleAirtableCookieHeader } from './airtable-cookie.util';
import {
  AirtableWebSession,
  AirtableWebSessionDocument,
} from './schemas/web-session.schema';

const SESSION_KEY = 'default';
const DRAFT_TTL_MS = 15 * 60 * 1000;

function cookieHeaderFromStorageState(state: {
  cookies?: Array<{ name: string; value: string }>;
}): string {
  const cookies = state.cookies ?? [];
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

@Injectable()
export class AirtableWebSessionService {
  private readonly log = new Logger(AirtableWebSessionService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(AirtableWebSession.name)
    private readonly sessions: Model<AirtableWebSessionDocument>,
    @InjectModel(AirtableWebLoginDraft.name)
    private readonly drafts: Model<AirtableWebLoginDraftDocument>,
  ) {}

  private get webHost(): string {
    return this.config
      .getOrThrow<string>('airtable.webHost')
      .replace(/\/$/, '');
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

  /**
   * Validates cookies by requesting Airtable web with the session.
   * Uses a lightweight GET that should succeed when logged in.
   */
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
    const res = await fetch(`${this.webHost}/`, {
      headers: {
        Cookie: header,
        Accept: 'text/html',
      },
      redirect: 'manual',
    });
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
   * If stored cookies fail validation, callers should re-run browser login or POST fresh cookies.
   */
  async ensureValidCookies(): Promise<string> {
    const existing = await this.getCookieHeader();
    if (existing && (await this.validateCookies(existing))) {
      return existing;
    }
    throw new HttpException(
      {
        message:
          'Airtable web cookies missing or invalid. Run web-session login or POST /airtable/web-session/cookies.',
        hasSession: Boolean(existing),
      },
      401,
    );
  }

  private async importPlaywright(): Promise<typeof import('playwright')> {
    try {
      return await import('playwright');
    } catch {
      this.log.warn(
        'Playwright is not installed. Run: cd backend && npx playwright install chromium',
      );
      throw new HttpException(
        'Playwright is required for automated login. Install playwright and chromium, or paste cookies manually.',
        501,
      );
    }
  }

  /**
   * Step 1: Airtable’s email + password form only (not “Sign in with Google” / SSO — use setCookieHeader for that).
   * Returns MFA challenge if Airtable asks for a code.
   */
  async beginWebLogin(body: {
    email?: string;
    password?: string;
  }): Promise<
    | { ok: true; mfaRequired: false }
    | { ok: true; mfaRequired: true; sessionKey: string }
  > {
    const email =
      body.email?.trim() ||
      this.config.get<string>('airtable.webLoginEmail')?.trim();
    const password =
      body.password?.trim() ||
      this.config.get<string>('airtable.webLoginPassword')?.trim();
    if (!email || !password) {
      throw new HttpException(
        'email and password required (body or AIRTABLE_WEB_LOGIN_EMAIL / AIRTABLE_WEB_LOGIN_PASSWORD).',
        400,
      );
    }

    const { chromium } = await this.importPlaywright();
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${this.webHost}/login`, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      await page.locator('input[type="email"]').first().fill(email);
      await page.locator('input[type="password"]').first().fill(password);
      await page
        .locator('button[type="submit"], [data-testid="sign-in-button"]')
        .first()
        .click();

      await new Promise((r) => setTimeout(r, 3000));

      const mfaLocator = page.locator(
        'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[name="code"], input[aria-label*="code" i]',
      );
      const mfaVisible = await mfaLocator
        .first()
        .isVisible()
        .catch(() => false);

      if (mfaVisible) {
        const storageState = (await context.storageState()) as Record<
          string,
          unknown
        >;
        const sessionKey = randomUUID();
        await this.drafts.create({
          sessionKey,
          storageState,
          lastUrl: page.url(),
          expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
        });
        return { ok: true, mfaRequired: true, sessionKey };
      }

      const storageState = (await context.storageState()) as Record<
        string,
        unknown
      >;
      const cookieHeader = cookieHeaderFromStorageState(
        storageState as { cookies?: { name: string; value: string }[] },
      );
      if (!cookieHeader) {
        throw new HttpException(
          'Login finished but no cookies were captured. Check Airtable login flow or use manual cookie paste.',
          502,
        );
      }
      await this.setCookieHeader(cookieHeader);
      await this.validateCookies(cookieHeader);
      return { ok: true, mfaRequired: false };
    } finally {
      await browser.close();
    }
  }

  /**
   * Step 2: submit MFA for a draft session created by beginWebLogin.
   */
  async completeWebLogin(body: {
    sessionKey: string;
    mfaCode: string;
  }): Promise<{ ok: true }> {
    const draft = await this.drafts.findOne({ sessionKey: body.sessionKey });
    if (!draft) {
      throw new HttpException('Unknown or expired sessionKey.', 404);
    }
    const code = body.mfaCode.trim();
    if (!code) {
      throw new HttpException('mfaCode is required.', 400);
    }

    const { chromium } = await this.importPlaywright();
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        storageState: draft.storageState as never,
      });
      const page = await context.newPage();
      await page.goto(draft.lastUrl, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      const mfaLocator = page.locator(
        'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[name="code"], input[aria-label*="code" i]',
      );
      await mfaLocator.first().fill(code);
      await page
        .locator('button[type="submit"]')
        .first()
        .click()
        .catch(() => page.keyboard.press('Enter'));

      await new Promise((r) => setTimeout(r, 5000));

      const storageState = (await context.storageState()) as Record<
        string,
        unknown
      >;
      const cookieHeader = cookieHeaderFromStorageState(
        storageState as { cookies?: { name: string; value: string }[] },
      );
      if (!cookieHeader) {
        throw new HttpException(
          'MFA step did not produce cookies. Verify the code and selectors.',
          502,
        );
      }
      await this.setCookieHeader(cookieHeader);
      await this.drafts.deleteOne({ sessionKey: body.sessionKey });
      await this.validateCookies(cookieHeader);
      return { ok: true };
    } finally {
      await browser.close();
    }
  }
}
