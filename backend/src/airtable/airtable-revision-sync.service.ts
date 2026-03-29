import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RawDataLogService } from '../raw-data/services/raw-data-log.service';
import { createCookieNotValidException } from './airtable-cookie-not-valid.exception';
import { plausibleAirtableCookieHeader } from './airtable-cookie.util';
import {
  looksLikeReadRowActivitiesJson,
  parseReadRowActivitiesJson,
} from './airtable-revision-api.parser';
import {
  dedupeParsedRevisionActivities,
  parseRevisionHistoryHtml,
  unwrapRevisionPayload,
} from './airtable-revision-html.parser';
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
import {
  REVISION_HTML_SELECTORS_JSON,
  REVISION_HTTP,
  REVISION_LEGACY_POST_BODY_TEMPLATE,
  REVISION_PATH_TEMPLATE,
  REVISION_STRINGIFIED_OBJECT_PARAMS,
  buildRevisionRefererUrl,
  randomRevisionClientQueueTime,
  randomRevisionPageLoadId,
  randomRevisionRequestId,
  randomRevisionSocketId,
  randomTraceparent,
} from './airtable-revision-http.constants';
import {
  isRevisionVerboseLogEnabled,
  logAirtableVendorRequest,
  logAirtableVendorResponse,
  warnAirtableRevisionFailure,
} from './airtable-vendor-log';

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
  /**
   * After JSON unwrap, body was very short — often wrong path/body template, expired session,
   * or non-HTML error payload (contrast with recordsWithNoParsedEntries = long but unparseable).
   */
  recordsWithShortPayload: number;
  errors: string[];
};

type AirtableRecordRow = { id?: string };

const REVISION_LOG_GROUP = 'airtable/revision';

function parseAirtableWebErrorMessage(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string; type?: string };
    };
    return j?.error?.message ?? j?.error?.type;
  } catch {
    return undefined;
  }
}

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
    private readonly rawLogs: RawDataLogService,
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

  private buildRevisionPathUrl(
    baseId: string,
    tableId: string,
    rowId: string,
  ): string {
    const vars = { baseId, tableId, rowId };
    const path = this.applyTemplate(REVISION_PATH_TEMPLATE, vars);
    const rel = path.startsWith('/') ? path : `/${path}`;
    const origin = this.webHost.replace(/\/$/, '');
    return `${origin}${rel}`;
  }

  /** GET readRowActivitiesAndComments — query matches browser (stringifiedObjectParams). */
  private buildRevisionGetUrl(
    baseId: string,
    tableId: string,
    rowId: string,
  ): string {
    const pathUrl = this.buildRevisionPathUrl(baseId, tableId, rowId);
    const u = new URL(pathUrl);
    u.searchParams.set(
      'stringifiedObjectParams',
      JSON.stringify(REVISION_STRINGIFIED_OBJECT_PARAMS),
    );
    u.searchParams.set('requestId', randomRevisionRequestId());
    u.searchParams.set('secretSocketId', randomRevisionSocketId());
    return u.toString();
  }

  private buildPostBody(
    baseId: string,
    tableId: string,
    rowId: string,
  ): Record<string, unknown> {
    const raw = REVISION_LEGACY_POST_BODY_TEMPLATE.trim();
    const jsonStr = this.applyTemplate(raw, { baseId, tableId, rowId });
    try {
      return JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      throw new HttpException(
        `Invalid REVISION_LEGACY_POST_BODY_TEMPLATE in airtable-revision-http.constants.ts: ${jsonStr.slice(0, 200)}`,
        500,
      );
    }
  }

  private buildRevisionFetchHeaders(
    cookieHeader: string,
    baseId: string,
    tableId: string,
    rowId: string,
  ): Record<string, string> {
    const web = this.webHost.replace(/\/$/, '');
    const referer = buildRevisionRefererUrl(web, baseId, tableId, rowId);
    const h = REVISION_HTTP;
    return {
      Cookie: cookieHeader,
      Accept: h.accept,
      'Accept-Language': h.acceptLanguage,
      'Cache-Control': h.cacheControl,
      Pragma: h.pragma,
      Priority: h.priority,
      Referer: referer,
      'Sec-CH-UA': h.secChUa,
      'Sec-CH-UA-Mobile': h.secChUaMobile,
      'Sec-CH-UA-Platform': h.secChUaPlatform,
      'Sec-Fetch-Dest': h.secFetchDest,
      'Sec-Fetch-Mode': h.secFetchMode,
      'Sec-Fetch-Site': h.secFetchSite,
      'Sec-GPC': h.secGpc,
      'User-Agent': h.userAgent,
      traceparent: randomTraceparent(),
      'x-airtable-application-id': baseId,
      'x-airtable-client-queue-time': randomRevisionClientQueueTime(),
      'x-airtable-inter-service-client': h.xAirtableInterServiceClient,
      'x-airtable-inter-service-client-code-version':
        h.xAirtableInterServiceClientCodeVersion,
      'x-airtable-page-load-id': randomRevisionPageLoadId(),
      'x-requested-with': h.xRequestedWith,
      'x-time-zone': h.xTimeZone,
      'x-user-locale': h.xUserLocale,
    };
  }

  /**
   * GET `/v0.3/row/{rowId}/readRowActivitiesAndComments` (default), or legacy POST if
   * `AIRTABLE_REVISION_POST_BODY_TEMPLATE` is non-empty.
   */
  async fetchRevisionResponse(
    cookieHeader: string,
    baseId: string,
    tableId: string,
    rowId: string,
  ): Promise<{ status: number; body: string; url: string }> {
    const usePost = REVISION_LEGACY_POST_BODY_TEMPLATE.trim().length > 0;

    let url: string;
    let init: RequestInit;

    if (usePost) {
      url = this.buildRevisionPathUrl(baseId, tableId, rowId);
      const bodyPayload = this.buildPostBody(baseId, tableId, rowId);
      const bodyJson = JSON.stringify(bodyPayload);
      logAirtableVendorRequest('revision', {
        method: 'POST',
        url,
        baseId,
        tableId,
        rowId,
        body: bodyPayload,
      });
      init = {
        method: 'POST',
        headers: {
          ...this.buildRevisionFetchHeaders(
            cookieHeader,
            baseId,
            tableId,
            rowId,
          ),
          'Content-Type': 'application/json',
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          Origin: this.webHost.replace(/\/$/, ''),
        },
        body: bodyJson,
      };
    } else {
      url = this.buildRevisionGetUrl(baseId, tableId, rowId);
      logAirtableVendorRequest('revision', {
        method: 'GET',
        url,
        baseId,
        tableId,
        rowId,
      });
      init = {
        method: 'GET',
        headers: this.buildRevisionFetchHeaders(
          cookieHeader,
          baseId,
          tableId,
          rowId,
        ),
      };
    }

    const res = await fetch(url, init);
    const responseBody = await res.text();
    logAirtableVendorResponse('revision', {
      url,
      status: res.status,
      bodyLength: responseBody.length,
      ...(isRevisionVerboseLogEnabled()
        ? { bodyPreview: responseBody.slice(0, 4000) }
        : {}),
    });

    if (res.status !== 200 && res.status !== 401 && res.status !== 403) {
      if (!isRevisionVerboseLogEnabled()) {
        warnAirtableRevisionFailure({
          url,
          status: res.status,
          rowId,
          bodyPreview: responseBody.slice(0, 400),
        });
      }
      this.log.warn(
        `Revision ${usePost ? 'POST' : 'GET'} ${res.status} ${url} row=${rowId}: ${responseBody.slice(0, 200)}`,
      );
    }

    return { status: res.status, body: responseBody, url };
  }

  /** One-shot fetch using stored web cookies (for API / UI debugging). */
  async debugFetchRevision(
    baseId: string,
    tableId: string,
    rowId: string,
  ): Promise<{ status: number; body: string; url: string }> {
    const cookieHeader = await this.webSession.ensureValidCookies();
    return this.fetchRevisionResponse(cookieHeader, baseId, tableId, rowId);
  }

  /**
   * Same as {@link fetchRevisionResponse} but returns body only; throws on 401/403.
   */
  async fetchRevisionHtml(
    cookieHeader: string,
    baseId: string,
    tableId: string,
    rowId: string,
  ): Promise<string> {
    const { status, body } = await this.fetchRevisionResponse(
      cookieHeader,
      baseId,
      tableId,
      rowId,
    );
    if (status === 401 || status === 403) {
      await this.webSession.recordValidationOutcome(false);
      throw createCookieNotValidException({
        airtableHttpStatus: status,
      });
    }
    return body;
  }

  /**
   * True when the body looks like an Airtable web login wall (narrow heuristics).
   * Avoids false negatives from the word "password" appearing in bundled JS / JSON.
   */
  private looksLikeAirtableLoginWall(body: string): boolean {
    const head = body.slice(0, 6000).toLowerCase();
    if (
      /<title[^>]*>[^<]{0,120}(sign in to airtable|log in to airtable)/i.test(
        body,
      )
    ) {
      return true;
    }
    if (
      /\bname=["']password["']\s+[^>]*\btype=["']password["']|\btype=["']password["']\s+[^>]*\bname=["']password["']/i.test(
        body,
      )
    ) {
      return true;
    }
    if (
      body.length < 900 &&
      head.includes('sign in') &&
      head.includes('email')
    ) {
      return true;
    }
    return false;
  }

  /**
   * True when the payload looks like revision history HTML (or JSON wrapping it).
   */
  private looksLikeRevisionPayload(body: string): boolean {
    if (looksLikeReadRowActivitiesJson(body)) {
      return true;
    }
    const lower = body.toLowerCase();
    return (
      lower.includes('data-revision') ||
      lower.includes('revision history') ||
      lower.includes('readrowactivities') ||
      lower.includes('activitiesandcomments') ||
      lower.includes('rowactivityinfobyid') ||
      (/\b(assignee|status)\b/.test(lower) &&
        (lower.includes('<div') || lower.includes('<span')))
    );
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
      const { status, body: raw } = await this.fetchRevisionResponse(
        cookieHeader,
        sample.baseId,
        sample.tableId,
        sample.rowId,
      );
      if (status === 401 || status === 403) {
        return false;
      }
      const body = unwrapRevisionPayload(raw).trim();
      if (looksLikeReadRowActivitiesJson(raw)) {
        return true;
      }
      if (body.length < 40) {
        return false;
      }
      if (this.looksLikeRevisionPayload(body)) {
        return true;
      }
      if (
        this.looksLikeAirtableLoginWall(body) ||
        this.looksLikeAirtableLoginWall(raw)
      ) {
        return false;
      }
      return body.length > 120;
    } catch {
      return false;
    }
  }

  private async persistRevisionSyncSummary(
    summary: RevisionSyncSummary,
  ): Promise<void> {
    const line = `Revision sync done: ${JSON.stringify(summary)}`;
    this.log.log(line);
    await this.rawLogs.append(REVISION_LOG_GROUP, line, 'info');
  }

  async syncRevisionHistory(
    opts: RevisionSyncOptions = {},
  ): Promise<RevisionSyncSummary> {
    const cookieHeader = await this.webSession.ensureValidCookies();
    const selectorsJson = REVISION_HTML_SELECTORS_JSON;
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
      recordsWithShortPayload: 0,
      errors: [],
    };

    let remaining = maxRecords;

    try {
      for (const page of pages) {
        const rows = readRecords(page.payload as Record<string, unknown>);
        for (const row of rows) {
          if (remaining-- <= 0) {
            return summary;
          }
          const rowId = row.id as string;
          try {
            const rev = await this.fetchRevisionResponse(
              cookieHeader,
              page.baseId,
              page.tableId,
              rowId,
            );
            summary.httpCalls += 1;
            const html = rev.body;
            if (rev.status === 401 || rev.status === 403) {
              await this.webSession.recordValidationOutcome(false);
              this.log.error(
                `Revision sync: HTTP ${rev.status} — cookie rejected by Airtable (row ${rowId}).`,
              );
              throw createCookieNotValidException({
                rowId,
                airtableHttpStatus: rev.status,
              });
            }
            if (rev.status !== 200) {
              const errDetail = parseAirtableWebErrorMessage(html);
              summary.errors.push(
                errDetail
                  ? `${rowId}: HTTP ${rev.status} — ${errDetail}`
                  : `${rowId}: HTTP ${rev.status} ${rev.url}`,
              );
              summary.recordsProcessed += 1;
              const unwrappedErr = unwrapRevisionPayload(html).trim();
              if (unwrappedErr.length <= 40) {
                summary.recordsWithShortPayload += 1;
              }
              continue;
            }
            const unwrapped = unwrapRevisionPayload(html).trim();
            if (unwrapped.length <= 40) {
              summary.recordsWithShortPayload += 1;
              this.log.debug(
                `Short revision payload for ${rowId} (${unwrapped.length} chars): ${unwrapped.slice(0, 120)}`,
              );
            }
            let activities = parseReadRowActivitiesJson(html);
            if (
              activities.length === 0 &&
              !looksLikeReadRowActivitiesJson(html)
            ) {
              activities = parseRevisionHistoryHtml(html, selectorsJson);
            }
            activities = dedupeParsedRevisionActivities(activities);
            if (activities.length === 0 && unwrapped.length > 40) {
              summary.recordsWithNoParsedEntries += 1;
              this.log.debug(
                `No parsed revision entries for ${rowId}; unwrapped starts with: ${unwrapped.slice(0, 120)}…`,
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
    } finally {
      await this.persistRevisionSyncSummary(summary);
    }
  }
}
