import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AirtableRevisionSyncService } from './airtable-revision-sync.service';
import { AirtableWebSessionService } from './airtable-web-session.service';
import { ProcessedChangelog } from './schemas/processed-changelog.schema';
import { AirtableRecordSyncPage } from './schemas/record-sync-page.schema';
import { AirtableRevisionEntry } from './schemas/revision-entry.schema';

function revisionHtmlForRow(rowId: string): string {
  return `
    <div data-revision-entry data-uuid="${rowId}-status" data-created-time="2024-03-01T00:00:00.000Z" data-user="user1">
      <span data-field>STATUS</span>
      <span data-old-value>Open</span>
      <span data-new-value>In Progress</span>
    </div>`;
}

describe('AirtableRevisionSyncService bulk (200 records)', () => {
  let service: AirtableRevisionSyncService;
  const findOneAndUpdate = jest.fn().mockResolvedValue({});

  beforeEach(async () => {
    jest.resetAllMocks();
    findOneAndUpdate.mockResolvedValue({});

    const records = Array.from({ length: 200 }, (_, i) => ({
      id: `rec${i}`,
    }));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AirtableRevisionSyncService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const m: Record<string, string> = {
                'airtable.webHost': 'https://airtable.com',
                'airtable.revisionHistoryPathTemplate':
                  '/v0.3/application/{baseId}/readRowActivitiesAndComments',
                'airtable.revisionPostBodyTemplate':
                  '{"tableId":"{tableId}","rowId":"{rowId}"}',
              };
              if (!(key in m)) {
                throw new Error(`missing ${key}`);
              }
              return m[key];
            },
            get: (key: string) =>
              key === 'airtable.revisionHtmlSelectorsJson' ? '' : undefined,
          },
        },
        {
          provide: AirtableWebSessionService,
          useValue: {
            ensureValidCookies: jest.fn().mockResolvedValue('br_session=x'),
          },
        },
        {
          provide: getModelToken(AirtableRecordSyncPage.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                {
                  baseId: 'appTEST',
                  tableId: 'tblTEST',
                  payload: { records },
                },
              ]),
            }),
          },
        },
        {
          provide: getModelToken(AirtableRevisionEntry.name),
          useValue: {
            findOneAndUpdate,
          },
        },
        {
          provide: getModelToken(ProcessedChangelog.name),
          useValue: {
            findOneAndUpdate,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AirtableRevisionSyncService);

    global.fetch = jest.fn((_url: string | URL, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(bodyStr) as { rowId: string };
      const rowId = body.rowId;
      const html = revisionHtmlForRow(rowId);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(html),
      });
    }) as unknown as typeof fetch;
  });

  it('fetches revision HTML for at least 200 records and upserts entries', async () => {
    const summary = await service.syncRevisionHistory({
      maxRecords: 200,
      delayMs: 0,
    });
    expect(summary.recordsProcessed).toBe(200);
    expect(summary.httpCalls).toBe(200);
    expect(summary.errors).toHaveLength(0);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(400);
    expect(summary.entriesUpserted).toBe(200);
  });
});
