import { randomBytes } from 'crypto';

/**
 * Outbound HTTP for Airtable web `readRowActivitiesAndComments` — aligned with a working
 * browser request (DevTools). Only the **Cookie** header is supplied at runtime (from MongoDB);
 * adjust values here for your tenant / client build instead of using env vars.
 *
 * @see https://airtable.com — paths and `x-airtable-inter-service-client-code-version` change over time.
 */

/** Path template; `{rowId}` is substituted per record. */
export const REVISION_PATH_TEMPLATE =
  '/v0.3/row/{rowId}/readRowActivitiesAndComments';

/**
 * Optional middle path segment for Referer (after `tableId`, before `rowId`).
 * Example from browser: `.../tblXXX/viwmzS9Q8zQsbO6ML/recYYY` → use full segment `viwmzS9Q8zQsbO6ML`.
 * Leave empty (`''`) if you prefer `app/tbl/rec` without a view (works for many bases).
 */
export const REVISION_REFERER_VIEW_SEGMENT = 'viwmzS9Q8zQsbO6ML';

/** Serialized into the `stringifiedObjectParams` query value (matches typical browser payload). */
export const REVISION_STRINGIFIED_OBJECT_PARAMS = {
  limit: 10,
  offsetV2: null,
  shouldReturnDeserializedActivityItems: true,
  shouldIncludeRowActivityOrCommentUserObjById: true,
} as const;

/**
 * Legacy POST flow only: non-empty JSON template with `{baseId}` `{tableId}` `{rowId}`.
 * Leave empty to use GET (default).
 */
export const REVISION_LEGACY_POST_BODY_TEMPLATE = '';

/** Optional Cheerio JSON overrides for HTML-only revision payloads. */
export const REVISION_HTML_SELECTORS_JSON = '';

/** Static header values (Cookie added in code). */
export const REVISION_HTTP = {
  accept: 'application/json, text/javascript, */*; q=0.01',
  acceptLanguage: 'en-GB,en;q=0.7',
  cacheControl: 'no-cache',
  pragma: 'no-cache',
  priority: 'u=1, i',
  secChUa: '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
  secChUaMobile: '?0',
  secChUaPlatform: '"macOS"',
  secFetchDest: 'empty',
  secFetchMode: 'cors',
  secFetchSite: 'same-origin',
  secGpc: '1',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  xAirtableInterServiceClient: 'webClient',
  /** Update when DevTools shows a new client build. */
  xAirtableInterServiceClientCodeVersion:
    '029f0e4eea880ee1fbaf05c512f8a755baa34e44',
  xRequestedWith: 'XMLHttpRequest',
  xTimeZone: 'Asia/Calcutta',
  xUserLocale: 'en',
} as const;

export function buildRevisionRefererUrl(
  webHost: string,
  baseId: string,
  tableId: string,
  rowId: string,
): string {
  const host = webHost.replace(/\/$/, '');
  const seg = REVISION_REFERER_VIEW_SEGMENT.trim();
  if (seg) {
    return `${host}/${baseId}/${tableId}/${seg}/${rowId}?blocks=hide`;
  }
  return `${host}/${baseId}/${tableId}/${rowId}?blocks=hide`;
}

/** `requestId=req…` query param (new value per request). */
export function randomRevisionRequestId(): string {
  return `req${randomBytes(12).toString('base64url').replace(/=/g, '')}`;
}

/** `secretSocketId=soc…` query param (new value per request). */
export function randomRevisionSocketId(): string {
  return `soc${randomBytes(12).toString('base64url').replace(/=/g, '')}`;
}

/** `x-airtable-page-load-id` — new value per request is fine for server-side calls. */
export function randomRevisionPageLoadId(): string {
  return randomBytes(9).toString('base64url').replace(/=/g, '').slice(0, 16);
}

export function randomRevisionClientQueueTime(): string {
  return String(1 + Math.random() * 2);
}

/** W3C traceparent; browsers often send this on XHR. */
export function randomTraceparent(): string {
  const traceId = randomBytes(16).toString('hex');
  const spanId = randomBytes(8).toString('hex');
  return `00-${traceId}-${spanId}-01`;
}
