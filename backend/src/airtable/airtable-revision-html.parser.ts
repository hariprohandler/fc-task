import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { isTag } from 'domhandler';
const TRACKED_FIELDS = new Set(['status', 'assignee']);

export type RevisionHtmlSelectors = {
  entry: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  uuid: string;
  createdTime: string;
  user: string;
};

export const DEFAULT_REVISION_SELECTORS: RevisionHtmlSelectors = {
  entry: '[data-revision-entry]',
  fieldLabel: '[data-field]',
  oldValue: '[data-old-value]',
  newValue: '[data-new-value]',
  uuid: '[data-uuid]',
  createdTime: '[data-created-time]',
  user: '[data-user]',
};

export type ParsedRevisionActivity = {
  activityId: string;
  columnType: string;
  oldValue: string;
  newValue: string;
  createdTime: string;
  originatingUserId: string;
};

export function normalizeFieldName(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) {
    return null;
  }
  const lower = t.toLowerCase();
  if (lower === 'status' || lower === 'assignee') {
    return lower;
  }
  return null;
}

function parseSelectorsJson(json: string): Partial<RevisionHtmlSelectors> {
  if (!json.trim()) {
    return {};
  }
  try {
    return JSON.parse(json) as Partial<RevisionHtmlSelectors>;
  } catch {
    return {};
  }
}

/** Airtable web APIs sometimes return JSON with an HTML fragment inside. */
function findHtmlStringInJson(obj: unknown, depth = 0): string | null {
  if (depth > 18) {
    return null;
  }
  if (typeof obj === 'string') {
    const s = obj;
    if (s.length < 60) {
      return null;
    }
    if (
      s.includes('<') &&
      /\b(div|span|table|article|li|td|tr|section)\b/i.test(s)
    ) {
      return s;
    }
    return null;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const f = findHtmlStringInJson(x, depth + 1);
      if (f) {
        return f;
      }
    }
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const f = findHtmlStringInJson(v, depth + 1);
      if (f) {
        return f;
      }
    }
  }
  return null;
}

export function unwrapRevisionPayload(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) {
    return raw;
  }
  try {
    const j = JSON.parse(t) as unknown;
    const html = findHtmlStringInJson(j);
    return html ?? raw;
  } catch {
    return raw;
  }
}

function parseStructuredEntries(
  $: cheerio.CheerioAPI,
  sel: RevisionHtmlSelectors,
): ParsedRevisionActivity[] {
  const out: ParsedRevisionActivity[] = [];
  $(sel.entry).each((_, el) => {
    const root = $(el);
    const fieldRaw = root.find(sel.fieldLabel).first().text();
    const columnType = normalizeFieldName(fieldRaw);
    if (!columnType) {
      return;
    }

    const oldValue = root.find(sel.oldValue).first().text().trim();
    const newValue = root.find(sel.newValue).first().text().trim();

    let activityId = root.attr('data-uuid')?.trim() ?? '';
    if (!activityId) {
      activityId = root.find(sel.uuid).first().attr('data-uuid')?.trim() ?? '';
    }
    if (!activityId) {
      activityId = root.find(sel.uuid).first().text().trim();
    }
    if (!activityId) {
      activityId = `synth-${columnType}-${oldValue}-${newValue}-${root.html()?.slice(0, 40)}`;
    }

    let createdTime =
      root.attr('data-created-time')?.trim() ??
      root.find(sel.createdTime).first().attr('data-created-time')?.trim() ??
      root.find(sel.createdTime).first().text().trim();
    if (!createdTime) {
      createdTime = new Date().toISOString();
    }

    let originatingUserId =
      root.attr('data-user')?.trim() ??
      root.find(sel.user).first().attr('data-user')?.trim() ??
      root.find(sel.user).first().text().trim();

    if (!originatingUserId) {
      originatingUserId = '';
    }

    out.push({
      activityId,
      columnType,
      oldValue,
      newValue,
      createdTime,
      originatingUserId,
    });
  });
  return out.filter((a) => TRACKED_FIELDS.has(a.columnType));
}

const LABEL_TAGS = new Set(['span', 'div', 'strong', 'b', 'p', 'label', 'h4']);

function isTextNode(n: { type?: string }): boolean {
  return n.type === 'text';
}

/**
 * Fallback when Airtable DOM does not use data-revision-entry:
 * find a short text node that is exactly STATUS / Assignee, then read following siblings.
 */
function parseHeuristicLabelRows(
  $: cheerio.CheerioAPI,
): ParsedRevisionActivity[] {
  const out: ParsedRevisionActivity[] = [];
  const seen = new Set<string>();

  $('*').each((_, el) => {
    if (!isTag(el)) {
      return;
    }
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    if (!LABEL_TAGS.has(tag)) {
      return;
    }

    const directTexts = $el
      .contents()
      .toArray()
      .filter((n) => isTextNode(n))
      .map((n) => $(n).text().trim())
      .filter(Boolean);
    let columnType: string | null = null;
    if (directTexts.length === 1) {
      columnType = normalizeFieldName(directTexts[0]);
    }
    if (!columnType) {
      const collapsed = $el.text().replace(/\s+/g, ' ').trim();
      if (collapsed.length > 0 && collapsed.length <= 48) {
        columnType = normalizeFieldName(collapsed);
      }
    }
    if (!columnType) {
      return;
    }

    const $parent = $el.parent();
    const children = $parent.children().toArray();
    const idx = children.indexOf(el);
    if (idx < 0) {
      return;
    }
    const following = children.slice(idx + 1);
    const siblingTexts: string[] = [];
    for (const node of following) {
      const txt = $(node).text().replace(/\s+/g, ' ').trim();
      if (txt) {
        siblingTexts.push(txt);
      }
    }

    let oldValue = '';
    let newValue = '';
    if (siblingTexts.length >= 2) {
      oldValue = siblingTexts[0];
      newValue = siblingTexts[1];
    } else if (siblingTexts.length === 1) {
      const one = siblingTexts[0];
      const parts = one.split(/\s*(?:→|->| to )\s*/i);
      if (parts.length >= 2) {
        oldValue = parts[0].trim();
        newValue = parts[parts.length - 1].trim();
      }
    }
    if (!oldValue && !newValue) {
      const $peer = $el.parent().next();
      if ($peer.length) {
        const one = $peer.text().replace(/\s+/g, ' ').trim();
        if (one) {
          const parts = one.split(/\s*(?:→|->| to )\s*/i);
          if (parts.length >= 2) {
            oldValue = parts[0].trim();
            newValue = parts[parts.length - 1].trim();
          } else {
            newValue = one;
          }
        }
      }
    }
    if (!oldValue && !newValue) {
      return;
    }

    const parentSnippet = ($parent.html() ?? '').slice(0, 120);
    const hash = createHash('sha256')
      .update(`${columnType}\0${oldValue}\0${newValue}\0${parentSnippet}`)
      .digest('hex')
      .slice(0, 20);
    const dedupeKey = hash;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    out.push({
      activityId: `heuristic-${hash}`,
      columnType,
      oldValue,
      newValue,
      createdTime: new Date().toISOString(),
      originatingUserId: '',
    });
  });

  return out.filter((a) => TRACKED_FIELDS.has(a.columnType));
}

/**
 * Parses Airtable revision-history HTML into activities.
 * Tries: (1) custom/structured selectors, (2) heuristic STATUS/Assignee rows, (3) JSON-wrapped HTML.
 */
export function parseRevisionHistoryHtml(
  html: string,
  selectorsJson?: string,
): ParsedRevisionActivity[] {
  const unwrapped = unwrapRevisionPayload(html);
  const sel = {
    ...DEFAULT_REVISION_SELECTORS,
    ...parseSelectorsJson(selectorsJson ?? ''),
  };
  const $ = cheerio.load(unwrapped);

  const structured = parseStructuredEntries($, sel);
  if (structured.length > 0) {
    return structured;
  }

  return parseHeuristicLabelRows($);
}

export function isTrackedColumnType(columnType: string): boolean {
  return TRACKED_FIELDS.has(columnType.toLowerCase());
}
