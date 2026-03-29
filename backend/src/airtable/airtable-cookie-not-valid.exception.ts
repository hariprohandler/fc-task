import { HttpException } from '@nestjs/common';

export const COOKIE_NOT_VALID_MESSAGE =
  'Airtable web cookies are missing or no longer valid. Paste a fresh Cookie header from DevTools (while logged into airtable.com) into POST /api/airtable/web-session/cookies.';

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
