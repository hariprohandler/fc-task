import {
  parseRevisionHistoryHtml,
  unwrapRevisionPayload,
  DEFAULT_REVISION_SELECTORS,
} from './airtable-revision-html.parser';

describe('parseRevisionHistoryHtml', () => {
  it('extracts Status and Assignee changes from fixture HTML', () => {
    const html = `
      <div>
        <div data-revision-entry data-uuid="act-1" data-created-time="2024-06-01T12:00:00.000Z" data-user="usrA">
          <span data-field>STATUS</span>
          <span data-old-value>Open</span>
          <span data-new-value>In Progress</span>
        </div>
        <div data-revision-entry data-uuid="act-2" data-created-time="2024-06-02T12:00:00.000Z" data-user="usrB">
          <span data-field>Assignee</span>
          <span data-old-value></span>
          <span data-new-value>SRED.io Integration</span>
        </div>
        <div data-revision-entry data-uuid="act-3">
          <span data-field>Title</span>
          <span data-old-value>a</span>
          <span data-new-value>b</span>
        </div>
      </div>
    `;
    const rows = parseRevisionHistoryHtml(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      activityId: 'act-1',
      columnType: 'status',
      oldValue: 'Open',
      newValue: 'In Progress',
      originatingUserId: 'usrA',
    });
    expect(rows[1].columnType).toBe('assignee');
  });

  it('merges custom selectors from JSON env-style string', () => {
    const html = `
      <div class="entry" data-uuid="x1" data-created-time="2020-01-01T00:00:00.000Z" data-user="u">
        <b class="lbl">status</b>
        <i class="from">Open</i>
        <i class="to">Closed</i>
      </div>
    `;
    const custom = JSON.stringify({
      entry: '.entry',
      fieldLabel: '.lbl',
      oldValue: '.from',
      newValue: '.to',
      uuid: '[data-uuid]',
      createdTime: '[data-created-time]',
      user: '[data-user]',
    });
    const rows = parseRevisionHistoryHtml(html, custom);
    expect(rows).toHaveLength(1);
    expect(rows[0].newValue).toBe('Closed');
    expect(DEFAULT_REVISION_SELECTORS.entry).toBe('[data-revision-entry]');
  });

  it('unwraps JSON payloads that embed HTML', () => {
    const inner = `<div><span>STATUS</span><span>Open</span><span>Closed</span></div>`;
    const wrapped = JSON.stringify({ nested: { htmlFragment: inner } });
    expect(unwrapRevisionPayload(wrapped)).toContain('<span>STATUS</span>');
    const rows = parseRevisionHistoryHtml(wrapped);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].columnType).toBe('status');
  });

  it('parses sibling label/value layout (heuristic)', () => {
    const html = `
      <div class="row">
        <span>Assignee</span><span>—</span><span>Jane Doe</span>
      </div>`;
    const rows = parseRevisionHistoryHtml(html);
    expect(rows.some((r) => r.columnType === 'assignee')).toBe(true);
  });
});
