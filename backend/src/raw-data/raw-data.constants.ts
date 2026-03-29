/** Never expose these Mongo collections in the Raw Data entity picker or rows API. */
export const RAW_DATA_COLLECTION_BLOCKLIST = new Set([
  'airtable_oauth_tokens',
  'airtable_oauth_state',
  'raw_data_logs',
]);

/** Single processed collection for the Airtable integration (Part C). */
export const AIRTABLE_PROCESSED_COLLECTION = 'processed_changelog';

/**
 * Virtual Raw Data entity id for an Airtable table: `atbl:{baseId}:{tableId}`.
 * Built from synced `airtable_bases_pages` / `airtable_tables_pages` metadata.
 */
export const AIRTABLE_TABLE_ENTITY_PREFIX = 'atbl:';

export function parseAirtableTableEntityId(
  entityId: string,
): { baseId: string; tableId: string } | null {
  if (!entityId.startsWith(AIRTABLE_TABLE_ENTITY_PREFIX)) {
    return null;
  }
  const rest = entityId.slice(AIRTABLE_TABLE_ENTITY_PREFIX.length);
  const i = rest.indexOf(':');
  if (i <= 0 || i >= rest.length - 1) {
    return null;
  }
  const baseId = rest.slice(0, i);
  const tableId = rest.slice(i + 1);
  if (!baseId.trim() || !tableId.trim()) {
    return null;
  }
  return { baseId, tableId };
}

export const MAX_RAW_DOCUMENTS = 8000;

export const INTEGRATION_IDS = {
  AIRTABLE: 'airtable',
} as const;
