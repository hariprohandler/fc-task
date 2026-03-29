import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import type { AirtableRecordSyncPageDocument } from '../airtable/schemas/record-sync-page.schema';
import { AirtableRecordSyncPage } from '../airtable/schemas/record-sync-page.schema';
import type { AirtableBaseSyncPageDocument } from '../airtable/schemas/base-sync-page.schema';
import { AirtableBaseSyncPage } from '../airtable/schemas/base-sync-page.schema';
import type { AirtableTableSyncPageDocument } from '../airtable/schemas/table-sync-page.schema';
import { AirtableTableSyncPage } from '../airtable/schemas/table-sync-page.schema';
import {
  AIRTABLE_PROCESSED_COLLECTION,
  INTEGRATION_IDS,
  MAX_RAW_DOCUMENTS,
  RAW_DATA_COLLECTION_BLOCKLIST,
  parseAirtableTableEntityId,
} from './raw-data.constants';

export type IntegrationListItem = {
  id: string;
  label: string;
  connected: boolean;
};

function serializeValue(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  ) {
    return String(v);
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  const ctor = (v as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === 'ObjectId' || ctor === 'UUID') {
    return (v as { toString: () => string }).toString();
  }
  try {
    return JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}

function sanitizeDocument(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(doc)) {
    if (val && typeof val === 'object') {
      const ctor = (val as { constructor?: { name?: string } }).constructor
        ?.name;
      if (ctor === 'ObjectId') {
        out[k] = (val as { toString: () => string }).toString();
        continue;
      }
      if (val instanceof Date) {
        out[k] = val.toISOString();
        continue;
      }
    }
    out[k] = val;
  }
  return out;
}

function rowForGrid(doc: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};
  const clean = sanitizeDocument(doc);
  for (const [k, v] of Object.entries(clean)) {
    flat[k] = serializeValue(v);
  }
  return flat;
}

function collectFieldNames(rows: Record<string, string>[]): string[] {
  const keySet = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      keySet.add(k);
    }
  }
  const rest = [...keySet].filter((k) => k !== 'id' && k !== '_id');
  rest.sort((a, b) => a.localeCompare(b));
  const out: string[] = [];
  if (keySet.has('id')) {
    out.push('id');
  }
  if (keySet.has('_id')) {
    out.push('_id');
  }
  return [...out, ...rest];
}

function collectBaseNamesFromPages(
  pages: Array<{ payload: Record<string, unknown> }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const { payload } of pages) {
    const bases = payload.bases;
    if (!Array.isArray(bases)) {
      continue;
    }
    for (const b of bases as unknown[]) {
      if (
        b &&
        typeof b === 'object' &&
        'id' in b &&
        typeof (b as { id: unknown }).id === 'string'
      ) {
        const id = (b as { id: string }).id;
        const name =
          'name' in b && (b as { name: unknown }).name != null
            ? String((b as { name: unknown }).name)
            : id;
        map.set(id, name);
      }
    }
  }
  return map;
}

function mergeTablesForBase(
  docs: Array<{ payload: Record<string, unknown> }>,
): Map<string, string> {
  const byTableId = new Map<string, string>();
  for (const doc of docs) {
    const tables = doc.payload?.tables;
    if (!Array.isArray(tables)) {
      continue;
    }
    for (const t of tables as unknown[]) {
      if (
        t &&
        typeof t === 'object' &&
        'id' in t &&
        typeof (t as { id: unknown }).id === 'string'
      ) {
        const id = (t as { id: string }).id;
        const name =
          'name' in t && (t as { name: unknown }).name != null
            ? String((t as { name: unknown }).name)
            : id;
        if (!byTableId.has(id)) {
          byTableId.set(id, name);
        }
      }
    }
  }
  return byTableId;
}

function airtableApiRecordToRow(
  record: Record<string, unknown>,
): Record<string, string> {
  const flat: Record<string, string> = {};
  flat.id =
    typeof record.id === 'string' ? record.id : serializeValue(record.id ?? '');
  flat.createdTime =
    typeof record.createdTime === 'string'
      ? record.createdTime
      : serializeValue(record.createdTime ?? '');
  const fields = record.fields;
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      flat[k] = serializeValue(v);
    }
  }
  return flat;
}

@Injectable()
export class RawDataService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(AirtableBaseSyncPage.name)
    private readonly basePages: Model<AirtableBaseSyncPageDocument>,
    @InjectModel(AirtableTableSyncPage.name)
    private readonly tablePages: Model<AirtableTableSyncPageDocument>,
    @InjectModel(AirtableRecordSyncPage.name)
    private readonly recordPages: Model<AirtableRecordSyncPageDocument>,
  ) {}

  /** Active integrations for the UI (Airtable only in this build). */
  listIntegrations(): Promise<IntegrationListItem[]> {
    return Promise.resolve([
      {
        id: INTEGRATION_IDS.AIRTABLE,
        label: 'Airtable',
        connected: true,
      },
    ]);
  }

  /** Airtable tables from last sync (`meta/bases` + `meta/bases/:id/tables` pages in Mongo). */
  private async listAirtableTableEntities(): Promise<
    { id: string; label: string }[]
  > {
    const [baseDocs, tableDocsRaw] = await Promise.all([
      this.basePages.find().lean().exec(),
      this.tablePages.find().lean().exec(),
    ]);
    const baseIdToName = collectBaseNamesFromPages(baseDocs);
    const tableDocs = tableDocsRaw as Array<{
      baseId: string;
      payload: Record<string, unknown>;
    }>;

    const tablesByBase = new Map<
      string,
      Array<{ payload: Record<string, unknown> }>
    >();
    for (const d of tableDocs) {
      const list = tablesByBase.get(d.baseId) ?? [];
      list.push({ payload: d.payload });
      tablesByBase.set(d.baseId, list);
    }

    const out: { id: string; label: string }[] = [];
    for (const [baseId, docs] of tablesByBase) {
      const merged = mergeTablesForBase(docs);
      const baseName = baseIdToName.get(baseId) ?? baseId;
      for (const [tableId, tableName] of merged) {
        out.push({
          id: `atbl:${baseId}:${tableId}`,
          label: `${baseName} › ${tableName}`,
        });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }

  async listEntities(integrationId: string): Promise<{
    rawEntities: { id: string; label: string }[];
    processedEntities: { id: string; label: string }[];
  }> {
    if (integrationId === INTEGRATION_IDS.AIRTABLE) {
      const rawEntities = await this.listAirtableTableEntities();
      const processedEntities = [
        {
          id: AIRTABLE_PROCESSED_COLLECTION,
          label: AIRTABLE_PROCESSED_COLLECTION,
        },
      ];
      return { rawEntities, processedEntities };
    }
    throw new BadRequestException(`Unknown integration: ${integrationId}`);
  }

  assertAllowedCollection(integrationId: string, collectionName: string) {
    if (integrationId !== INTEGRATION_IDS.AIRTABLE) {
      throw new BadRequestException(`Unknown integration: ${integrationId}`);
    }
    if (RAW_DATA_COLLECTION_BLOCKLIST.has(collectionName)) {
      throw new BadRequestException(
        `Collection not allowed: ${collectionName}`,
      );
    }
    if (collectionName === AIRTABLE_PROCESSED_COLLECTION) {
      return;
    }
    if (parseAirtableTableEntityId(collectionName)) {
      return;
    }
    throw new BadRequestException(`Collection not allowed: ${collectionName}`);
  }

  private async fetchAirtableTableRecordRows(
    baseId: string,
    tableId: string,
    limit: number,
  ): Promise<{
    fields: string[];
    rows: Record<string, string>[];
    totalInDb: number;
    truncated: boolean;
  }> {
    const pages = await this.recordPages
      .find({ baseId, tableId })
      .lean()
      .exec();
    let totalRecords = 0;
    for (const p of pages) {
      const recs = p.payload?.records;
      totalRecords += Array.isArray(recs) ? recs.length : 0;
    }
    const cap = Math.min(Math.max(1, limit), MAX_RAW_DOCUMENTS);
    const rows: Record<string, string>[] = [];
    outer: for (const p of pages) {
      const recs = p.payload?.records;
      if (!Array.isArray(recs)) {
        continue;
      }
      for (const r of recs) {
        if (rows.length >= cap) {
          break outer;
        }
        if (r && typeof r === 'object') {
          rows.push(airtableApiRecordToRow(r as Record<string, unknown>));
        }
      }
    }
    const fields = collectFieldNames(rows);
    return {
      fields,
      rows,
      totalInDb: totalRecords,
      truncated: totalRecords > rows.length,
    };
  }

  async fetchCollectionRows(
    integrationId: string,
    collectionName: string,
    limit: number,
  ): Promise<{
    fields: string[];
    rows: Record<string, string>[];
    totalInDb: number;
    truncated: boolean;
  }> {
    this.assertAllowedCollection(integrationId, collectionName);
    const parsed = parseAirtableTableEntityId(collectionName);
    if (parsed) {
      return this.fetchAirtableTableRecordRows(
        parsed.baseId,
        parsed.tableId,
        limit,
      );
    }

    const db = this.connection.db;
    if (!db) {
      throw new BadRequestException('Database connection not ready');
    }
    const coll = db.collection(collectionName);
    const cap = Math.min(Math.max(1, limit), MAX_RAW_DOCUMENTS);
    const totalInDb = await coll.estimatedDocumentCount();
    const cursor = coll.find({}).limit(cap);
    const docs = await cursor.toArray();
    const rows = docs.map((d) =>
      rowForGrid(d as unknown as Record<string, unknown>),
    );
    const fields = collectFieldNames(rows);
    return {
      fields,
      rows,
      totalInDb,
      truncated: docs.length >= cap && totalInDb > cap,
    };
  }
}
