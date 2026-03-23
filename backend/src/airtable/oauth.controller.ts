import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AirtableOAuthService } from './airtable-oauth.service';

@Controller('airtable/oauth')
export class AirtableOAuthController {
  constructor(private readonly oauth: AirtableOAuthService) {}

  /** SPA: open this URL in the browser or redirect the user. */
  @Get('authorization-url')
  async authorizationUrl() {
    if (this.oauth.usesPersonalAccessToken()) {
      throw new BadRequestException(
        'AIRTABLE_PERSONAL_ACCESS_TOKEN is set; API calls use the PAT. Remove it to use OAuth.',
      );
    }
    return this.oauth.createAuthorizationUrl();
  }

  /** Browser-friendly: starts OAuth (302 to Airtable). */
  @Get('login')
  async login(@Res() res: Response) {
    if (this.oauth.usesPersonalAccessToken()) {
      throw new BadRequestException(
        'AIRTABLE_PERSONAL_ACCESS_TOKEN is set; API calls use the PAT. Remove it to use OAuth.',
      );
    }
    const { authorizationUrl } = await this.oauth.createAuthorizationUrl();
    return res.redirect(authorizationUrl);
  }

  /** Redirect target configured in Airtable integration settings. */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    const successUrl = this.oauth.successRedirect;
    if (error) {
      const msg = encodeURIComponent(errorDescription ?? error);
      return res.redirect(`${successUrl}?airtable_oauth_error=${msg}`);
    }
    if (!code || !state) {
      return res.redirect(
        `${successUrl}?airtable_oauth_error=${encodeURIComponent('missing_code_or_state')}`,
      );
    }
    try {
      const tokens = await this.oauth.exchangeCodeForTokens(code, state);
      await this.oauth.persistTokens(tokens);
    } catch (e) {
      const msg = encodeURIComponent(
        e instanceof Error ? e.message : 'token_exchange_failed',
      );
      return res.redirect(`${successUrl}?airtable_oauth_error=${msg}`);
    }
    return res.redirect(`${successUrl}?airtable_oauth=success`);
  }

  @Get('status')
  async status() {
    const connected = await this.oauth.isConnected();
    const auth = await this.oauth.authMode();
    return { connected, auth };
  }

  /** Uses the stored refresh token to rotate credentials. */
  @Get('refresh')
  async refresh() {
    if (this.oauth.usesPersonalAccessToken()) {
      throw new BadRequestException(
        'Personal access token is in use; nothing to refresh.',
      );
    }
    try {
      await this.oauth.refreshAccessToken();
      return { ok: true };
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof Error ? e.message : 'refresh_failed',
      );
    }
  }
}
