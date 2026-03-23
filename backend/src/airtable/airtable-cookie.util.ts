/**
 * Rejects obvious placeholders and non-cookie strings before hitting Airtable.
 * Real browser Cookie headers are semicolon-separated name=value pairs.
 */
export function plausibleAirtableCookieHeader(header: string): boolean {
  const h = header.trim();
  if (h.length < 16) {
    return false;
  }
  // At least one name=value pair (name is non-empty, value may be empty)
  if (!/[^;\s=]+=[^;]*/.test(h)) {
    return false;
  }
  const lower = h.toLowerCase();
  const blocklist = [
    'paste_',
    'paste ',
    'your_cookie',
    'your-cookie',
    'changeme',
    'example.com',
    'xxx',
    'todo',
    'replace_me',
    'full_cookie_header_here',
  ];
  for (const b of blocklist) {
    if (lower.includes(b)) {
      return false;
    }
  }
  return true;
}
