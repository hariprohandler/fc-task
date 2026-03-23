/** Airtable list endpoints return `offset` when more pages exist. */
export function readOffset(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const o = (body as { offset?: unknown }).offset;
  return typeof o === 'string' && o.length > 0 ? o : undefined;
}
