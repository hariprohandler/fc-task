import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  AIRTABLE_PROCESSED_COLLECTION,
  INTEGRATION_IDS,
  MAX_RAW_DOCUMENTS,
  RAW_DATA_COLLECTION_BLOCKLIST,
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

function collectionLabel(name: string): string {
  return name;
}

@Injectable()
export class RawDataService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Active integrations for the UI: Airtable is always available when this app is in use;
   * GitHub is shown as connected when a token is configured, `github_*` collections exist, or
   * `GITHUB_INTEGRATION_ACTIVE=1`.
   */
  async listIntegrations(): Promise<IntegrationListItem[]> {
    const githubConnected = await this.isGithubIntegrationConnected();
    return [
      {
        id: INTEGRATION_IDS.AIRTABLE,
        label: 'Airtable',
        connected: true,
      },
      {
        id: INTEGRATION_IDS.GITHUB,
        label: 'GitHub',
        connected: githubConnected,
      },
    ];
  }

  private async isGithubIntegrationConnected(): Promise<boolean> {
    if (process.env.GITHUB_INTEGRATION_ACTIVE === '1') {
      return true;
    }
    const token =
      process.env.GITHUB_TOKEN?.trim() ||
      process.env.GH_TOKEN?.trim() ||
      process.env.GITHUB_ACCESS_TOKEN?.trim();
    if (token) {
      return true;
    }
    const all = await this.listMongoCollectionNames();
    return this.filterGithubCollections(all).length > 0;
  }

  private async listMongoCollectionNames(): Promise<string[]> {
    const db = this.connection.db;
    if (!db) {
      return [];
    }
    const cols = await db.listCollections().toArray();
    return cols.map((c) => c.name).sort((a, b) => a.localeCompare(b));
  }

  private filterRawByPrefix(names: string[], prefix: string): string[] {
    const p = prefix.toLowerCase();
    return names.filter(
      (n) =>
        n.toLowerCase().startsWith(p) && !RAW_DATA_COLLECTION_BLOCKLIST.has(n),
    );
  }

  private filterGithubCollections(names: string[]): string[] {
    return names.filter(
      (n) =>
        !RAW_DATA_COLLECTION_BLOCKLIST.has(n) &&
        (n.toLowerCase().startsWith('github_') || n.toLowerCase() === 'github'),
    );
  }

  async listEntities(integrationId: string): Promise<{
    rawEntities: { id: string; label: string }[];
    processedEntities: { id: string; label: string }[];
  }> {
    const all = await this.listMongoCollectionNames();
    if (integrationId === INTEGRATION_IDS.AIRTABLE) {
      const rawNames = this.filterRawByPrefix(all, 'airtable_');
      const rawEntities = rawNames.map((name) => ({
        id: name,
        label: collectionLabel(name),
      }));
      const processedEntities = [
        {
          id: AIRTABLE_PROCESSED_COLLECTION,
          label: AIRTABLE_PROCESSED_COLLECTION,
        },
      ];
      return { rawEntities, processedEntities };
    }
    if (integrationId === INTEGRATION_IDS.GITHUB) {
      const rawNames = this.filterGithubCollections(all);
      const rawEntities = rawNames.map((name) => ({
        id: name,
        label: collectionLabel(name),
      }));
      return {
        rawEntities,
        processedEntities: [] as { id: string; label: string }[],
      };
    }
    throw new BadRequestException(`Unknown integration: ${integrationId}`);
  }

  assertAllowedCollection(integrationId: string, collectionName: string) {
    if (
      integrationId !== INTEGRATION_IDS.AIRTABLE &&
      integrationId !== INTEGRATION_IDS.GITHUB
    ) {
      throw new BadRequestException(`Unknown integration: ${integrationId}`);
    }
    if (RAW_DATA_COLLECTION_BLOCKLIST.has(collectionName)) {
      throw new BadRequestException(
        `Collection not allowed: ${collectionName}`,
      );
    }
    const p = collectionName.toLowerCase();
    if (integrationId === INTEGRATION_IDS.AIRTABLE) {
      if (collectionName === AIRTABLE_PROCESSED_COLLECTION) {
        return;
      }
      if (p.startsWith('airtable_')) {
        return;
      }
      throw new BadRequestException(
        `Collection not allowed: ${collectionName}`,
      );
    }
    if (integrationId === INTEGRATION_IDS.GITHUB) {
      if (p.startsWith('github_') || p === 'github') {
        return;
      }
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
