/**
 * Structured logs for every outbound HTTP call to Airtable (API, web, OAuth).
 * Set `AIRTABLE_VENDOR_LOG=0` to disable. Default is on (`1` or unset).
 * `AIRTABLE_REVISION_DEBUG=1` still forces web/revision-style detail for backward compatibility.
 */

const ENV_KEY = 'AIRTABLE_VENDOR_LOG';

export function isAirtableVendorLogEnabled(): boolean {
  const v = process.env[ENV_KEY];
  if (v === '0' || v === 'false') {
    return false;
  }
  return true;
}

export function isRevisionVerboseLogEnabled(): boolean {
  return (
    isAirtableVendorLogEnabled() || process.env.AIRTABLE_REVISION_DEBUG === '1'
  );
}

export type VendorChannel = 'api' | 'web' | 'oauth' | 'revision';

function tag(channel: VendorChannel): string {
  switch (channel) {
    case 'api':
      return 'AirtableAPI';
    case 'web':
      return 'AirtableWeb';
    case 'oauth':
      return 'AirtableOAuth';
    case 'revision':
      return 'AirtableRevision';
    default:
      return 'AirtableVendor';
  }
}

function shouldLogChannel(channel: VendorChannel): boolean {
  if (channel === 'revision') {
    return isRevisionVerboseLogEnabled();
  }
  return isAirtableVendorLogEnabled();
}

export function logAirtableVendorRequest(
  channel: VendorChannel,
  payload: Record<string, unknown>,
): void {
  if (!shouldLogChannel(channel)) {
    return;
  }
  console.log(`[${tag(channel)}] request`, payload);
}

export function logAirtableVendorResponse(
  channel: VendorChannel,
  payload: Record<string, unknown>,
): void {
  if (!shouldLogChannel(channel)) {
    return;
  }
  console.log(`[${tag(channel)}] response`, payload);
}

/**
 * When full vendor logging is off, surface failed non-revision calls.
 * Revision failures use {@link warnAirtableRevisionFailure} so `AIRTABLE_REVISION_DEBUG=1` still prints.
 */
export function warnAirtableVendorFailure(
  channel: VendorChannel,
  payload: Record<string, unknown>,
): void {
  if (channel === 'revision' || isAirtableVendorLogEnabled()) {
    return;
  }
  console.warn(`[${tag(channel)}] failure`, payload);
}

export function warnAirtableRevisionFailure(
  payload: Record<string, unknown>,
): void {
  if (isRevisionVerboseLogEnabled()) {
    return;
  }
  console.warn('[AirtableRevision] failure', payload);
}
