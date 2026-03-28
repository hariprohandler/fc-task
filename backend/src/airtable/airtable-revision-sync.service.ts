import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { plausibleAirtableCookieHeader } from './airtable-cookie.util';
import { parseRevisionHistoryHtml } from './airtable-revision-html.parser';
import { AirtableWebSessionService } from './airtable-web-session.service';
import {
  AirtableRecordSyncPage,
  AirtableRecordSyncPageDocument,
} from './schemas/record-sync-page.schema';
import {
  AirtableRevisionEntry,
  AirtableRevisionEntryDocument,
} from './schemas/revision-entry.schema';
import {
  ProcessedChangelog,
  ProcessedChangelogDocument,
} from './schemas/processed-changelog.schema';

export type RevisionSyncOptions = {
  baseId?: string;
  tableId?: string;
  /** Max records to scrape (for tests / partial runs). */
  maxRecords?: number;
  /** Delay ms between HTTP calls. */
  delayMs?: number;
};

export type RevisionSyncSummary = {
  recordsProcessed: number;
  httpCalls: number;
  entriesUpserted: number;
  /** Fetched a response but parser found no Status/Assignee rows (check HTML shape / selectors). */
  recordsWithNoParsedEntries: number;
  errors: string[];
};

type AirtableRecordRow = { id?: string };

function readRecords(payload: Record<string, unknown>): AirtableRecordRow[] {
  const recs = payload.records;
  if (!Array.isArray(recs)) {
    return [];
  }
  return recs.filter(
    (r): r is AirtableRecordRow =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as AirtableRecordRow).id === 'string',
  );
}

@Injectable()
export class AirtableRevisionSyncService {
  private readonly log = new Logger(AirtableRevisionSyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly webSession: AirtableWebSessionService,
    @InjectModel(AirtableRecordSyncPage.name)
    private readonly recordPages: Model<AirtableRecordSyncPageDocument>,
    @InjectModel(AirtableRevisionEntry.name)
    private readonly revisions: Model<AirtableRevisionEntryDocument>,
    @InjectModel(ProcessedChangelog.name)
    private readonly processedChangelog: Model<ProcessedChangelogDocument>,
  ) {}

  private get webHost(): string {
    return this.config
      .getOrThrow<string>('airtable.webHost')
      .replace(/\/$/, '');
  }

  private applyTemplate(
    template: string,
    vars: Record<string, string>,
  ): string {
    let s = template;
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(v);
    }
    return s;
  }

  private buildRevisionPostUrl(
    baseId: string,
    tableId: string,
    rowId: string,
  ): string {
    const pathTpl = this.config.getOrThrow<string>(
      'airtable.revisionHistoryPathTemplate',
    );
    const path = this.applyTemplate(pathTpl, { baseId, tableId, rowId });
    const rel = path.startsWith('/') ? path : `/${path}`;
    return `${this.webHost}${rel}`;
  }

  private buildPostBody(
    baseId: string,
    tableId: string,
    rowId: string,
  ): Record<string, unknown> {
    const raw = this.config.getOrThrow<string>(
      'airtable.revisionPostBodyTemplate',
    );
    const jsonStr = this.applyTemplate(raw, { baseId, tableId, rowId });
    try {
      return JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      throw new HttpException(
        `Invalid AIRTABLE_REVISION_POST_BODY_TEMPLATE JSON after substitution: ${jsonStr.slice(0, 200)}`,
        500,
      );
    }
  }

  /**
   * POST revision history for one row; returns HTML or throws on hard failures.
   */
  async fetchRevisionHtml(
    cookieHeader: string,
    baseId: string,
    tableId: string,
    rowId: string,
  ): Promise<string> {
    const url = this.buildRevisionPostUrl(baseId, tableId, rowId);
    const body = this.buildPostBody(baseId, tableId, rowId);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        'Content-Type': 'application/json',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        Origin: this.webHost,
        Referer: `${this.webHost}/`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new HttpException(
        {
          message: 'Revision history request unauthorized',
          status: res.status,
        },
        res.status,
      );
    }
    if (!res.ok) {
      this.log.warn(
        `Revision POST ${res.status} for ${rowId}: ${text.slice(0, 120)}`,
      );
    }
    return text;
  }

  /**
   * Validates cookies against a real revision POST when possible (stronger than GET /).
   */
  async validateCookiesWithRevision(
    cookieHeader: string,
    sample: { baseId: string; tableId: string; rowId: string },
  ): Promise<boolean> {
    if (!plausibleAirtableCookieHeader(cookieHeader)) {
      return false;
    }
    try {
      const html = await this.fetchRevisionHtml(
        cookieHeader,
        sample.baseId,
        sample.tableId,
        sample.rowId,
      );
      const lower = html.toLowerCase();
      const looksLikeLogin =
        lower.includes('sign in') ||
        lower.includes('log in') ||
        lower.includes('password');
      return html.length > 50 && !looksLikeLogin;
    } catch {
      return false;
    }
  }

  async syncRevisionHistory(
    opts: RevisionSyncOptions = {},
  ): Promise<RevisionSyncSummary> {
    const cookieHeader = await this.webSession.ensureValidCookies();
    const selectorsJson =
      this.config.get<string>('airtable.revisionHtmlSelectorsJson') ?? '';
    const delayMs = opts.delayMs ?? 120;
    const maxRecords = opts.maxRecords ?? Number.POSITIVE_INFINITY;

    const query: Record<string, string> = {};
    if (opts.baseId) {
      query.baseId = opts.baseId;
    }
    if (opts.tableId) {
      query.tableId = opts.tableId;
    }

    const pages = await this.recordPages.find(query).lean();
    const summary: RevisionSyncSummary = {
      recordsProcessed: 0,
      httpCalls: 0,
      entriesUpserted: 0,
      recordsWithNoParsedEntries: 0,
      errors: [],
    };

    let remaining = maxRecords;

    for (const page of pages) {
      const rows = readRecords(page.payload as Record<string, unknown>);
      for (const row of rows) {
        if (remaining-- <= 0) {
          return summary;
        }
        const rowId = row.id as string;
        try {
          const html = await this.fetchRevisionHtml(
            cookieHeader,
            page.baseId,
            page.tableId,
            rowId,
          );
          summary.httpCalls += 1;
          const activities = parseRevisionHistoryHtml(html, selectorsJson);
          if (activities.length === 0 && html.trim().length > 40) {
            summary.recordsWithNoParsedEntries += 1;
            this.log.debug(
              `No parsed revision entries for ${rowId}; response starts with: ${html.trim().slice(0, 80)}…`,
            );
          }
          for (const a of activities) {
            const created = new Date(a.createdTime);
            if (Number.isNaN(created.getTime())) {
              continue;
            }
            await this.revisions.findOneAndUpdate(
              { issueId: rowId, uuid: a.activityId },
              {
                $set: {
                  uuid: a.activityId,
                  issueId: rowId,
                  columnType: a.columnType,
                  oldValue: a.oldValue,
                  newValue: a.newValue,
                  createdDate: created,
                  authoredBy: a.originatingUserId,
                  baseId: page.baseId,
                  tableId: page.tableId,
                },
              },
              { upsert: true },
            );
            await this.processedChangelog.findOneAndUpdate(
              { issueId: rowId, uuid: a.activityId },
              {
                $set: {
                  uuid: a.activityId,
                  issueId: rowId,
                  authorUuid: a.originatingUserId,
                  created,
                  itemsField: a.columnType,
                  itemsFieldType: a.columnType,
                  itemsFieldId: a.columnType,
                },
              },
              { upsert: true },
            );
            summary.entriesUpserted += 1;
          }
          summary.recordsProcessed += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          summary.errors.push(`${rowId}: ${msg}`);
          this.log.warn(`Revision sync failed for ${rowId}: ${msg}`);
        }

        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    return summary;
  }
}
