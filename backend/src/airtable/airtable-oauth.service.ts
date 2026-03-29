import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import {
  AirtableOAuthState,
  AirtableOAuthStateDocument,
} from './schemas/oauth-state.schema';
import {
  AirtableOAuthToken,
  AirtableOAuthTokenDocument,
} from './schemas/oauth-token.schema';
import {
  isAirtableVendorLogEnabled,
  logAirtableVendorRequest,
  logAirtableVendorResponse,
  warnAirtableVendorFailure,
} from './airtable-vendor-log';

const TOKEN_KEY = 'default';

export type TokenExchangeResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type?: string;
  scope?: string;
};

@Injectable()
export class AirtableOAuthService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(AirtableOAuthState.name)
    private readonly stateModel: Model<AirtableOAuthStateDocument>,
    @InjectModel(AirtableOAuthToken.name)
    private readonly tokenModel: Model<AirtableOAuthTokenDocument>,
  ) {}

  private get webHost(): string {
    return this.config.getOrThrow<string>('airtable.webHost');
  }

  get redirectUri(): string {
    return this.config.getOrThrow<string>('airtable.oauthRedirectUri');
  }

  get successRedirect(): string {
    return this.config.getOrThrow<string>('airtable.oauthSuccessRedirect');
  }

  private get clientId(): string {
    return this.config.getOrThrow<string>('airtable.oauthClientId');
  }

  private get clientSecret(): string {
    return this.config.get<string>('airtable.oauthClientSecret', '');
  }

  private get scopes(): string {
    return this.config.getOrThrow<string>('airtable.oauthScopes');
  }

  buildPkcePair(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(96).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    return { codeVerifier, codeChallenge };
  }

  async createAuthorizationUrl(): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    if (!this.clientId || !this.redirectUri) {
      throw new InternalServerErrorException(
        'Airtable OAuth is not configured (client id / redirect URI).',
      );
    }
    const state = randomBytes(48).toString('base64url');
    const { codeVerifier, codeChallenge } = this.buildPkcePair();
    await this.stateModel.create({ state, codeVerifier });

    const url = new URL(`${this.webHost}/oauth2/v1/authorize`);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes.replace(/,/g, ' ').trim());

    return { authorizationUrl: url.toString(), state };
  }

  async exchangeCodeForTokens(
    code: string,
    state: string,
  ): Promise<TokenExchangeResponse> {
    const cached = await this.stateModel.findOne({ state }).exec();
    if (!cached) {
      throw new BadRequestException('Invalid or expired OAuth state.');
    }
    await this.stateModel.deleteOne({ _id: cached._id }).exec();

    const body = new URLSearchParams({
      client_id: this.clientId,
      code_verifier: cached.codeVerifier,
      redirect_uri: this.redirectUri,
      code,
      grant_type: 'authorization_code',
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const secret = this.clientSecret.trim();
    if (secret) {
      const basic = Buffer.from(`${this.clientId}:${secret}`).toString(
        'base64',
      );
      headers.Authorization = `Basic ${basic}`;
    }

    const tokenUrl = `${this.webHost}/oauth2/v1/token`;
    logAirtableVendorRequest('oauth', {
      method: 'POST',
      url: tokenUrl,
      grantType: 'authorization_code',
    });
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body,
    });
    const data = (await res.json()) as TokenExchangeResponse & {
      error?: string;
      error_description?: string;
    };
    const bodyStr = JSON.stringify(data);
    logAirtableVendorResponse('oauth', {
      url: tokenUrl,
      status: res.status,
      bodyLength: bodyStr.length,
      note: 'response body omitted (tokens)',
    });
    if (!res.ok) {
      if (!isAirtableVendorLogEnabled()) {
        warnAirtableVendorFailure('oauth', {
          url: tokenUrl,
          status: res.status,
          error: data.error,
        });
      }
      throw new UnauthorizedException(
        data.error_description ?? data.error ?? 'Token exchange failed',
      );
    }
    return data;
  }

  async persistTokens(data: TokenExchangeResponse): Promise<void> {
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await this.tokenModel
      .findOneAndUpdate(
        { key: TOKEN_KEY },
        {
          key: TOKEN_KEY,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt,
          tokenType: data.token_type,
          scope: data.scope,
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async refreshAccessToken(): Promise<TokenExchangeResponse> {
    const doc = await this.tokenModel.findOne({ key: TOKEN_KEY }).exec();
    if (!doc?.refreshToken) {
      throw new UnauthorizedException(
        'No refresh token stored. Authorize again.',
      );
    }
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: doc.refreshToken,
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const secret = this.clientSecret.trim();
    if (secret) {
      const basic = Buffer.from(`${this.clientId}:${secret}`).toString(
        'base64',
      );
      headers.Authorization = `Basic ${basic}`;
    }
    const tokenUrl = `${this.webHost}/oauth2/v1/token`;
    logAirtableVendorRequest('oauth', {
      method: 'POST',
      url: tokenUrl,
      grantType: 'refresh_token',
    });
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body,
    });
    const data = (await res.json()) as TokenExchangeResponse & {
      error?: string;
      error_description?: string;
    };
    const bodyStr = JSON.stringify(data);
    logAirtableVendorResponse('oauth', {
      url: tokenUrl,
      status: res.status,
      bodyLength: bodyStr.length,
      note: 'response body omitted (tokens)',
    });
    if (!res.ok) {
      if (!isAirtableVendorLogEnabled()) {
        warnAirtableVendorFailure('oauth', {
          url: tokenUrl,
          status: res.status,
          error: data.error,
        });
      }
      throw new UnauthorizedException(
        data.error_description ?? data.error ?? 'Refresh failed',
      );
    }
    await this.persistTokens(data);
    return data;
  }

  async getStoredToken(): Promise<AirtableOAuthTokenDocument | null> {
    return this.tokenModel.findOne({ key: TOKEN_KEY }).exec();
  }

  /** Bearer access token for `Authorization: Bearer …` (refresh when near expiry). */
  async getValidAccessToken(): Promise<string> {
    const doc = await this.getStoredToken();
    if (!doc) {
      throw new UnauthorizedException(
        'Not connected to Airtable. Complete OAuth via GET /api/airtable/oauth/login.',
      );
    }
    const skewMs = 60_000;
    if (doc.expiresAt.getTime() > Date.now() + skewMs) {
      return doc.accessToken;
    }
    const refreshed = await this.refreshAccessToken();
    return refreshed.access_token;
  }

  async isConnected(): Promise<boolean> {
    const doc = await this.getStoredToken();
    return !!doc?.accessToken;
  }

  async authMode(): Promise<'oauth' | 'none'> {
    const doc = await this.getStoredToken();
    return doc?.accessToken ? 'oauth' : 'none';
  }
}
