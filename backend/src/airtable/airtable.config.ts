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
  /**
   * Web session login (Playwright). Optional; you can also POST cookies manually.
   * Never commit real credentials.
   */
  webLoginEmail: process.env.AIRTABLE_WEB_LOGIN_EMAIL ?? '',
  webLoginPassword: process.env.AIRTABLE_WEB_LOGIN_PASSWORD ?? '',
  /**
   * POST path template for revision HTML (placeholders: {baseId}, {tableId}, {rowId}).
   * Capture the exact path from your browser’s Network tab when opening Revision history.
   */
  revisionHistoryPathTemplate:
    process.env.AIRTABLE_REVISION_HISTORY_PATH_TEMPLATE ??
    '/v0.3/application/{baseId}/readRowActivitiesAndComments',
  /**
   * JSON object template for the POST body. Placeholders: {baseId}, {tableId}, {rowId}.
   * Example: {"tableId":"{tableId}","rowId":"{rowId}"}
   */
  revisionPostBodyTemplate:
    process.env.AIRTABLE_REVISION_POST_BODY_TEMPLATE ??
    '{"tableId":"{tableId}","rowId":"{rowId}"}',
  /**
   * Optional JSON override for Cheerio selectors (entry, fieldLabel, oldValue, newValue, uuid, createdTime, user).
   */
  revisionHtmlSelectorsJson: process.env.AIRTABLE_REVISION_HTML_SELECTORS ?? '',
}));
