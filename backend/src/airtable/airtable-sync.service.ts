import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RawDataLogService } from '../raw-data/services/raw-data-log.service';
import { AirtableApiService } from './airtable-api.service';
import type { RevisionSyncSummary } from './airtable-revision-sync.service';
import { AirtableRevisionSyncService } from './airtable-revision-sync.service';
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

export type FullSyncOptions = {
  /** After API sync, run web revision/changelog scrape (requires valid Airtable cookies). */
  includeRevisionHistory?: boolean;
  revisionMaxRecords?: number;
  revisionDelayMs?: number;
};

export type SyncSummary = {
  basePages: number;
  tablePages: number;
  recordPages: number;
  userPages: number;
  bases: number;
  tablesSynced: number;
  usersError?: string;
  revisionHistory?: RevisionSyncSummary;
  revisionHistoryError?: string;
};

export type BasesSyncSummary = {
  basePages: number;
  bases: number;
};

export type TablesSyncSummary = {
  tablePages: number;
  bases: number;
  tablesSynced: number;
};

export type RecordsSyncSummary = {
  recordPages: number;
  bases: number;
  tablesSynced: number;
};

export type UsersSyncSummary = {
  userPages: number;
  usersError?: string;
};

const SYNC_LOG_GROUP = 'airtable/sync';

function dedupeBasePages<T extends { pageOffset: string | null }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = r.pageOffset ?? '';
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

function dedupeTablePages<
  T extends { baseId: string; pageOffset: string | null },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.baseId}\0${r.pageOffset ?? ''}`;
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

function dedupeRecordPages<
  T extends { baseId: string; tableId: string; pageOffset: string | null },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.baseId}\0${r.tableId}\0${r.pageOffset ?? ''}`;
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

@Injectable()
export class AirtableSyncService {
  private readonly log = new Logger(AirtableSyncService.name);

  constructor(
    private readonly api: AirtableApiService,
    private readonly revision: AirtableRevisionSyncService,
    private readonly rawLogs: RawDataLogService,
    @InjectModel(AirtableBaseSyncPage.name)
    private readonly basePages: Model<AirtableBaseSyncPageDocument>,
    @InjectModel(AirtableTableSyncPage.name)
    private readonly tablePages: Model<AirtableTableSyncPageDocument>,
    @InjectModel(AirtableRecordSyncPage.name)
    private readonly recordPages: Model<AirtableRecordSyncPageDocument>,
    @InjectModel(AirtableUserSyncPage.name)
    private readonly userPages: Model<AirtableUserSyncPageDocument>,
  ) {}

  private async trace(
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
  ): Promise<void> {
    this.log[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      message,
    );
    await this.rawLogs.append(SYNC_LOG_GROUP, message, level);
  }

  async syncBasesOnly(): Promise<BasesSyncSummary> {
    await this.trace('Bases: clearing stored pages');
    await this.basePages.deleteMany({});
    const basePageDocs = await this.api.listBasesPages();
    const baseRows = dedupeBasePages(
      basePageDocs.map((p) => ({
        pageOffset: p.pageOffset,
        payload: p.payload,
      })),
    );
    if (baseRows.length > 0) {
      await this.basePages.insertMany(baseRows);
    }
    const baseCount = collectBaseIdsFromPages(baseRows).length;
    await this.trace(
      `Bases: done — ${baseRows.length} page(s), ${baseCount} base id(s)`,
    );
    return {
      basePages: baseRows.length,
      bases: baseCount,
    };
  }

  async syncTablesOnly(): Promise<TablesSyncSummary> {
    await this.trace('Tables: clearing stored pages');
    await this.tablePages.deleteMany({});
    const basePageDocs = await this.api.listBasesPages();
    const baseIds = collectBaseIdsFromPages(basePageDocs);

    let tablePageCount = 0;
    let tablesSynced = 0;
    for (const baseId of baseIds) {
      await this.trace(`Tables: fetching schema for base ${baseId}`);
      const tablePageList = await this.api.listTablesPages(baseId);
      const tableRows = dedupeTablePages(
        tablePageList.map((p) => ({
          baseId,
          pageOffset: p.pageOffset,
          payload: p.payload,
        })),
      );
      tablePageCount += tableRows.length;
      if (tableRows.length > 0) {
        await this.tablePages.insertMany(tableRows);
      }
      tablesSynced += collectTableIdsFromPages(tableRows).length;
    }

    await this.trace(
      `Tables: done — ${tablePageCount} page(s) across ${baseIds.length} base(s), ${tablesSynced} table id(s)`,
    );
    return {
      tablePages: tablePageCount,
      bases: baseIds.length,
      tablesSynced,
    };
  }

  async syncRecordsOnly(): Promise<RecordsSyncSummary> {
    await this.trace('Records: clearing stored pages');
    await this.recordPages.deleteMany({});
    const basePageDocs = await this.api.listBasesPages();
    const baseIds = collectBaseIdsFromPages(basePageDocs);

    let tablesSynced = 0;
    let recordPageCount = 0;
    for (const baseId of baseIds) {
      const tablePageList = await this.api.listTablesPages(baseId);
      const tableIds = collectTableIdsFromPages(tablePageList);
      tablesSynced += tableIds.length;

      for (const tableId of tableIds) {
        await this.trace(`Records: base ${baseId} table ${tableId}`);
        const recPages = await this.api.listRecordsPages(baseId, tableId);
        const recordRows = dedupeRecordPages(
          recPages.map((p) => ({
            baseId,
            tableId,
            pageOffset: p.pageOffset,
            payload: p.payload,
          })),
        );
        recordPageCount += recordRows.length;
        if (recordRows.length > 0) {
          await this.recordPages.insertMany(recordRows);
        }
      }
    }

    await this.trace(
      `Records: done — ${recordPageCount} record page(s), ${baseIds.length} base(s), ${tablesSynced} table(s)`,
    );
    return {
      recordPages: recordPageCount,
      bases: baseIds.length,
      tablesSynced,
    };
  }

  async syncUsersOnly(): Promise<UsersSyncSummary> {
    await this.trace('Users: clearing stored pages');
    await this.userPages.deleteMany({});

    let userPageCount = 0;
    let usersError: string | undefined;
    try {
      await this.trace('Users: fetching pages from Airtable API');
      const userPageList = await this.api.listUsersPages();
      const userRows = dedupeBasePages(
        userPageList.map((p) => ({
          pageOffset: p.pageOffset,
          payload: p.payload,
        })),
      );
      userPageCount = userRows.length;
      if (userRows.length > 0) {
        await this.userPages.insertMany(userRows);
      }
    } catch (e) {
      usersError = e instanceof Error ? e.message : String(e);
      await this.trace(
        `Users: GET /users failed (may require extra scopes or enterprise): ${usersError}`,
        'warn',
      );
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

    await this.trace(
      usersError
        ? `Users: finished with warning — ${userPageCount} page(s)`
        : `Users: done — ${userPageCount} page(s)`,
      usersError ? 'warn' : 'info',
    );
    return {
      userPages: userPageCount,
      usersError,
    };
  }

  /** Full sync: replace all page collections, follow Airtable pagination everywhere. */
  async syncAll(opts: FullSyncOptions = {}): Promise<SyncSummary> {
    await this.trace('Full sync started');
    const bases = await this.syncBasesOnly();
    const tables = await this.syncTablesOnly();
    const records = await this.syncRecordsOnly();
    const users = await this.syncUsersOnly();

    const summary: SyncSummary = {
      basePages: bases.basePages,
      tablePages: tables.tablePages,
      recordPages: records.recordPages,
      userPages: users.userPages,
      bases: bases.bases,
      tablesSynced: records.tablesSynced,
      usersError: users.usersError,
    };

    if (opts.includeRevisionHistory) {
      try {
        summary.revisionHistory = await this.revision.syncRevisionHistory({
          maxRecords: opts.revisionMaxRecords,
          delayMs: opts.revisionDelayMs,
        });
        await this.trace(
          `Revision history after full sync: ${JSON.stringify(summary.revisionHistory)}`,
        );
      } catch (e: unknown) {
        let msg: string;
        if (e instanceof HttpException) {
          const r = e.getResponse();
          msg = typeof r === 'string' ? r : JSON.stringify(r);
        } else if (e instanceof Error) {
          msg = e.message;
        } else {
          msg = String(e);
        }
        summary.revisionHistoryError = msg;
        await this.trace(
          `Revision history not run after full sync: ${msg}`,
          'warn',
        );
      }
    }

    await this.trace(
      `Full sync finished — bases ${bases.bases}, tables ${records.tablesSynced}, record pages ${records.recordPages}, user pages ${users.userPages}${opts.includeRevisionHistory ? ', revision requested' : ''}`,
    );
    return summary;
  }
}
