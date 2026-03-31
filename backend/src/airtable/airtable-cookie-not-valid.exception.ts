import { HttpException } from '@nestjs/common';

export const COOKIE_NOT_VALID_MESSAGE =
  'Airtable web cookie is not available or no longer valid. Configure it manually (paste Cookie header from DevTools) or click Sync in Airtable Session configuration to fetch and auto-populate cookies.';

/** Standard 401 body for revision / web-session flows when the stored cookie is unusable. */
export function createCookieNotValidException(
  extra?: Record<string, unknown>,
): HttpException {
  return new HttpException(
    {
      error: 'COOKIE_NOT_VALID',
      message: COOKIE_NOT_VALID_MESSAGE,
      ...extra,
    },
    401,
  );
}
