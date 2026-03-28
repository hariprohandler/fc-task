/** Mongo collection names users may browse (OAuth/session secrets excluded). */
export const AIRTABLE_ENTITY_COLLECTIONS: {
  name: string;
  label: string;
  category: 'raw' | 'processed';
}[] = [
  {
    name: 'airtable_bases_pages',
    label: 'Bases',
    category: 'raw',
  },
  {
    name: 'airtable_tables_pages',
    label: 'Tables',
    category: 'raw',
  },
  {
    name: 'airtable_records_pages',
    label: 'Records',
    category: 'raw',
  },
  {
    name: 'airtable_users_pages',
    label: 'Users',
    category: 'raw',
  },
  {
    name: 'processed_changelog',
    label: 'processed_changelog',
    category: 'processed',
  },
  {
    name: 'airtable_web_sessions',
    label: 'Web session',
    category: 'processed',
  },
];

export const RAW_DATA_INTEGRATIONS = [
  { id: 'airtable', label: 'Airtable' },
] as const;

export const MAX_RAW_DOCUMENTS = 8000;
