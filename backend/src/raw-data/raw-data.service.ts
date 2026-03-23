import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  AIRTABLE_ENTITY_COLLECTIONS,
  MAX_RAW_DOCUMENTS,
  RAW_DATA_INTEGRATIONS,
} from './raw-data.constants';

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
  const keys = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      keys.add(k);
    }
  }
  const list = [...keys].sort((a, b) => a.localeCompare(b));
  const idIdx = list.indexOf('_id');
  if (idIdx > 0) {
    list.splice(idIdx, 1);
    list.unshift('_id');
  }
  return list;
}

@Injectable()
export class RawDataService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  listIntegrations() {
    return RAW_DATA_INTEGRATIONS.map((i) => ({ id: i.id, label: i.label }));
  }

  listEntities(integrationId: string) {
    if (integrationId !== 'airtable') {
      throw new BadRequestException(`Unknown integration: ${integrationId}`);
    }
    const raw = AIRTABLE_ENTITY_COLLECTIONS.filter(
      (c) => c.category === 'raw',
    ).map((c) => ({ id: c.name, label: c.label }));
    const processed = AIRTABLE_ENTITY_COLLECTIONS.filter(
      (c) => c.category === 'processed',
    ).map((c) => ({ id: c.name, label: c.label }));
    return { rawEntities: raw, processedEntities: processed };
  }

  assertAllowedCollection(integrationId: string, collectionName: string) {
    if (integrationId !== 'airtable') {
      throw new BadRequestException(`Unknown integration: ${integrationId}`);
    }
    const allowed = new Set(AIRTABLE_ENTITY_COLLECTIONS.map((c) => c.name));
    if (!allowed.has(collectionName)) {
      throw new BadRequestException(
        `Collection not allowed: ${collectionName}`,
      );
    }
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
