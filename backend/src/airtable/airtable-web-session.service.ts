import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
    const validateUrl = `${this.webHost}/`;
    logAirtableVendorRequest('web', {
      method: 'GET',
      url: validateUrl,
      purpose: 'cookie_validation',
    });
    const res = await fetch(validateUrl, {
      headers: {
        Cookie: header,
        Accept: 'text/html',
      },
      redirect: 'manual',
    });
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
