import { Body, Controller, Get, Post } from '@nestjs/common';
import { plausibleAirtableCookieHeader } from './airtable-cookie.util';
import { AirtableRevisionSyncService } from './airtable-revision-sync.service';
import { AirtableWebSessionService } from './airtable-web-session.service';

@Controller('airtable/web-session')
export class AirtableWebSessionController {
  constructor(
    private readonly session: AirtableWebSessionService,
    private readonly revision: AirtableRevisionSyncService,
  ) {}

  @Get('status')
  async status() {
    return this.session.getStatus();
  }

  /** Set cookies manually (e.g. copied from DevTools). */
  @Post('cookies')
  async setCookies(@Body() body: { cookieHeader: string }) {
    if (!body?.cookieHeader?.trim()) {
      return { ok: false, message: 'cookieHeader required' };
    }
    if (!plausibleAirtableCookieHeader(body.cookieHeader)) {
      return {
        ok: false,
        valid: false,
        message:
          'cookieHeader must look like real browser cookies (name=value; …). Copy the full Cookie header from DevTools while logged into airtable.com.',
      };
    }
    await this.session.setCookieHeader(body.cookieHeader);
    const ok = await this.session.validateCookies(body.cookieHeader);
    return { ok: true, valid: ok };
  }

  /**
   * Light check (GET with Cookie). For a stronger check, pass a sample record
   * so we POST the revision endpoint once.
   */
  @Post('validate')
  async validate(
    @Body()
    body: {
      cookieHeader?: string;
      sample?: { baseId: string; tableId: string; rowId: string };
    },
  ) {
    if (body?.cookieHeader?.trim()) {
      await this.session.setCookieHeader(body.cookieHeader);
    }
    const h = await this.session.getCookieHeader();
    if (!h) {
      return { ok: false, valid: false, message: 'No cookies' };
    }
    if (body?.sample) {
      const valid = await this.revision.validateCookiesWithRevision(
        h,
        body.sample,
      );
      await this.session.recordValidationOutcome(valid);
      return { ok: true, valid, mode: 'revision_post' };
    }
    const valid = await this.session.validateCookies(h);
    return { ok: true, valid, mode: 'header_get' };
  }

  @Post('login/begin')
  async loginBegin(@Body() body: { email?: string; password?: string }) {
    return this.session.beginWebLogin(body ?? {});
  }

  @Post('login/complete')
  async loginComplete(@Body() body: { sessionKey: string; mfaCode: string }) {
    return this.session.completeWebLogin(body);
  }
}
