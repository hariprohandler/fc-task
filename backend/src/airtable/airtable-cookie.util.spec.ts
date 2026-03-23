import { plausibleAirtableCookieHeader } from './airtable-cookie.util';

describe('plausibleAirtableCookieHeader', () => {
  it('rejects placeholder and strings without =', () => {
    expect(plausibleAirtableCookieHeader('PASTE_FULL_COOKIE_HEADER_HERE')).toBe(
      false,
    );
    expect(plausibleAirtableCookieHeader('not-a-cookie')).toBe(false);
    expect(plausibleAirtableCookieHeader('a')).toBe(false);
  });

  it('accepts typical cookie header shape', () => {
    expect(
      plausibleAirtableCookieHeader(
        'brw=abc123; __Host-airtable-session=eyJhbGc; other=x',
      ),
    ).toBe(true);
  });
});
