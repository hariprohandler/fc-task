import * as cheerio from 'cheerio';
import type { ParsedRevisionActivity } from './airtable-revision-html.parser';
import { normalizeFieldName } from './airtable-revision-html.parser';

function slugFieldLabel(label: string): string {
  const t = label.replace(/\s+/g, ' ').trim();
  const norm = normalizeFieldName(t);
  if (norm) {
    return norm;
  }
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parses one Airtable `diffRowHtml` fragment (cell update) from readRowActivitiesAndComments JSON.
 */
export function parseDiffRowHtml(html: string): {
  fieldKey: string;
  oldValue: string;
  newValue: string;
} | null {
  const $ = cheerio.load(html);
  const label = $('.historicalCellContainer .micro')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  if (!label) {
    return null;
  }
  const fieldKey = slugFieldLabel(label);

  const $textDiff = $('.textDiff');
  if ($textDiff.length) {
    const oldValue = $textDiff
      .find('.strikethrough')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    let newValue = $textDiff
      .find('.colors-background-success')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (!newValue) {
      const $afterOld = $textDiff
        .find('.strikethrough')
        .first()
        .nextAll('span');
      newValue = $afterOld.first().text().replace(/\s+/g, ' ').trim();
    }
    return { fieldKey, oldValue, newValue };
  }

  const newValue = $('.historicalCellValue')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  return { fieldKey, oldValue: '', newValue };
}

type RowActivityInfo = {
  createdTime?: string;
  originatingUserId?: string;
  diffRowHtml?: string;
  groupType?: string;
};

type CommentInfo = {
  id?: string;
  text?: string;
  createdTime?: string;
  userId?: string;
};

/**
 * Parses the JSON body from GET `/v0.3/row/{rowId}/readRowActivitiesAndComments`.
 */
export function parseReadRowActivitiesJson(
  raw: string,
): ParsedRevisionActivity[] {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!root || typeof root !== 'object') {
    return [];
  }
  const o = root as Record<string, unknown>;
  if (o.msg !== 'SUCCESS') {
    return [];
  }
  const data = o.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return [];
  }

  const ordered = data.orderedActivityAndCommentIds;
  const byId = data.rowActivityInfoById as
    | Record<string, RowActivityInfo>
    | undefined;
  const commentsById = data.commentsById as
    | Record<string, CommentInfo>
    | undefined;

  if (!Array.isArray(ordered)) {
    return [];
  }

  const out: ParsedRevisionActivity[] = [];

  for (const id of ordered) {
    if (typeof id !== 'string') {
      continue;
    }

    const act = byId?.[id];
    if (act && typeof act.diffRowHtml === 'string') {
      const parsed = parseDiffRowHtml(act.diffRowHtml);
      if (!parsed) {
        continue;
      }
      const createdTime =
        typeof act.createdTime === 'string'
          ? act.createdTime
          : new Date().toISOString();
      const originatingUserId =
        typeof act.originatingUserId === 'string' ? act.originatingUserId : '';
      out.push({
        activityId: id,
        columnType: parsed.fieldKey,
        oldValue: parsed.oldValue,
        newValue: parsed.newValue,
        createdTime,
        originatingUserId,
      });
      continue;
    }

    const com = commentsById?.[id];
    if (com) {
      const createdTime =
        typeof com.createdTime === 'string'
          ? com.createdTime
          : new Date().toISOString();
      const originatingUserId =
        typeof com.userId === 'string' ? com.userId : '';
      out.push({
        activityId: id,
        columnType: 'comment',
        oldValue: '',
        newValue: typeof com.text === 'string' ? com.text : '',
        createdTime,
        originatingUserId,
      });
    }
  }

  return out;
}

export function looksLikeReadRowActivitiesJson(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith('{')) {
    return false;
  }
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    return j.msg === 'SUCCESS' && j.data !== undefined;
  } catch {
    return false;
  }
}
