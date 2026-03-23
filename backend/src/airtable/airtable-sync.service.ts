import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AirtableApiService } from './airtable-api.service';
import type { AirtableBaseSyncPageDocument } from './schemas/base-sync-page.schema';
import { AirtableBaseSyncPage } from './schemas/base-sync-page.schema';
import type { AirtableRecordSyncPageDocument } from './schemas/record-sync-page.schema';
import { AirtableRecordSyncPage } from './schemas/record-sync-page.schema';
import type { AirtableTableSyncPageDocument } from './schemas/table-sync-page.schema';
import { AirtableTableSyncPage } from './schemas/table-sync-page.schema';
import type { AirtableUserSyncPageDocument } from './schemas/user-sync-page.schema';
import { AirtableUserSyncPage } from './schemas/user-sync-page.schema';

function hasStringId(v: unknown): v is { id: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    typeof (v as { id: unknown }).id === 'string'
  );
}

function collectTableIdsFromPages(
  pages: Array<{ payload: Record<string, unknown> }>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const { payload } of pages) {
    const tables = payload.tables;
    if (!Array.isArray(tables)) {
      continue;
    }
    for (const t of tables as unknown[]) {
      if (hasStringId(t) && !seen.has(t.id)) {
        seen.add(t.id);
        ids.push(t.id);
      }
    }
  }
  return ids;
}

function collectBaseIdsFromPages(
  pages: Array<{ payload: Record<string, unknown> }>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const { payload } of pages) {
    const bases = payload.bases;
    if (!Array.isArray(bases)) {
      continue;
    }
    for (const b of bases as unknown[]) {
      if (hasStringId(b) && !seen.has(b.id)) {
        seen.add(b.id);
        ids.push(b.id);
      }
    }
  }
  return ids;
}

export type SyncSummary = {
  basePages: number;
  tablePages: number;
  recordPages: number;
  userPages: number;
  bases: number;
  tablesSynced: number;
  usersError?: string;
};

@Injectable()
export class AirtableSyncService {
  private readonly log = new Logger(AirtableSyncService.name);

  constructor(
    private readonly api: AirtableApiService,
    @InjectModel(AirtableBaseSyncPage.name)
    private readonly basePages: Model<AirtableBaseSyncPageDocument>,
    @InjectModel(AirtableTableSyncPage.name)
    private readonly tablePages: Model<AirtableTableSyncPageDocument>,
    @InjectModel(AirtableRecordSyncPage.name)
    private readonly recordPages: Model<AirtableRecordSyncPageDocument>,
    @InjectModel(AirtableUserSyncPage.name)
    private readonly userPages: Model<AirtableUserSyncPageDocument>,
  ) {}

  /** Full sync: replace all page collections, follow Airtable pagination everywhere. */
  async syncAll(): Promise<SyncSummary> {
    await Promise.all([
      this.basePages.deleteMany({}),
      this.tablePages.deleteMany({}),
      this.recordPages.deleteMany({}),
      this.userPages.deleteMany({}),
    ]);

    const basePageDocs = await this.api.listBasesPages();
    if (basePageDocs.length > 0) {
      await this.basePages.insertMany(
        basePageDocs.map((p) => ({
          pageOffset: p.pageOffset,
          payload: p.payload,
        })),
      );
    }

    const baseIds = collectBaseIdsFromPages(basePageDocs);
    let tablePageCount = 0;
    let recordPageCount = 0;
    let tablesSynced = 0;

    for (const baseId of baseIds) {
      const tablePageList = await this.api.listTablesPages(baseId);
      tablePageCount += tablePageList.length;
      if (tablePageList.length > 0) {
        await this.tablePages.insertMany(
          tablePageList.map((p) => ({
            baseId,
            pageOffset: p.pageOffset,
            payload: p.payload,
          })),
        );
      }

      const tableIds = collectTableIdsFromPages(tablePageList);
      tablesSynced += tableIds.length;

      for (const tableId of tableIds) {
        const recPages = await this.api.listRecordsPages(baseId, tableId);
        recordPageCount += recPages.length;
        if (recPages.length > 0) {
          await this.recordPages.insertMany(
            recPages.map((p) => ({
              baseId,
              tableId,
              pageOffset: p.pageOffset,
              payload: p.payload,
            })),
          );
        }
      }
    }

    let userPageCount = 0;
    let usersError: string | undefined;
    try {
      const userPageList = await this.api.listUsersPages();
      userPageCount = userPageList.length;
      if (userPageList.length > 0) {
        await this.userPages.insertMany(
          userPageList.map((p) => ({
            pageOffset: p.pageOffset,
            payload: p.payload,
          })),
        );
      }
    } catch (e) {
      usersError = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `GET /users failed (may require extra scopes or enterprise): ${usersError}`,
      );
      await this.userPages.create({
        pageOffset: null,
        payload: {
          error: usersError,
          note: 'Users listing may require additional OAuth scopes or an enterprise feature set.',
        },
      });
      userPageCount = 1;
    }

    return {
      basePages: basePageDocs.length,
      tablePages: tablePageCount,
      recordPages: recordPageCount,
      userPages: userPageCount,
      bases: baseIds.length,
      tablesSynced,
      usersError,
    };
  }
}
