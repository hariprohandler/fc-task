import { registerAs } from '@nestjs/config';

export default registerAs('airtable', () => ({
  oauthClientId: process.env.AIRTABLE_OAUTH_CLIENT_ID ?? '',
  oauthClientSecret: process.env.AIRTABLE_OAUTH_CLIENT_SECRET ?? '',
  oauthRedirectUri: process.env.AIRTABLE_OAUTH_REDIRECT_URI ?? '',
  oauthScopes:
    process.env.AIRTABLE_OAUTH_SCOPES ?? 'schema.bases:read data.records:read',
  oauthSuccessRedirect:
    process.env.AIRTABLE_OAUTH_SUCCESS_REDIRECT ?? 'http://localhost:4200',
  webHost: process.env.AIRTABLE_WEB_HOST ?? 'https://airtable.com',
  apiBase: process.env.AIRTABLE_API_BASE ?? 'https://api.airtable.com/v0',
}));
