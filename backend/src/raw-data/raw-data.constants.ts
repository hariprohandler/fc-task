/** Never expose these Mongo collections in the Raw Data entity picker or rows API. */
export const RAW_DATA_COLLECTION_BLOCKLIST = new Set([
  'airtable_oauth_tokens',
  'airtable_oauth_state',
  'raw_data_logs',
]);

/** Single processed collection for the Airtable integration (Part C). */
export const AIRTABLE_PROCESSED_COLLECTION = 'processed_changelog';

export const MAX_RAW_DOCUMENTS = 8000;

export const INTEGRATION_IDS = {
  AIRTABLE: 'airtable',
} as const;
