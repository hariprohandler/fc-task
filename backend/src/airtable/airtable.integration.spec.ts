import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { AppModule } from '../app.module';
import { AirtableApiService } from './airtable-api.service';
import { AirtableOAuthService } from './airtable-oauth.service';

/** Load backend/.env before reading process.env (Jest does not load it automatically). */
loadEnv({ path: resolve(process.cwd(), '.env') });

const hasOAuthClient =
  Boolean(process.env.AIRTABLE_OAUTH_CLIENT_ID?.trim()) &&
  Boolean(process.env.AIRTABLE_OAUTH_CLIENT_SECRET?.trim());

/** OAuth client credentials; tokens must exist in Mongo after browser login. */
const canRun = Boolean(process.env.MONGODB_URI) && hasOAuthClient;

const runIntegration = process.env.RUN_AIRTABLE_INTEGRATION === '1';

if (runIntegration && !canRun) {
  describe('Airtable API + Mongo (integration prerequisites)', () => {
    it('requires MONGODB_URI and AIRTABLE_OAUTH_CLIENT_ID + AIRTABLE_OAUTH_CLIENT_SECRET in backend/.env', () => {
      expect(canRun).toBe(true);
    });
  });
}

const describeLive = runIntegration && canRun ? describe : describe.skip;

describeLive('Airtable API + Mongo (integration)', () => {
  let app: INestApplication;
  let api: AirtableApiService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    api = app.get(AirtableApiService);

    const oauth = app.get(AirtableOAuthService);
    const connected = await oauth.isConnected();
    if (!connected) {
      throw new Error(
        'No OAuth tokens in Mongo. Open GET /api/airtable/oauth/login in a browser once, then re-run this test.',
      );
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('calls GET /meta/bases with Bearer OAuth token and prints paginated pages', async () => {
    const pages = await api.listBasesPages();

    console.log(
      '\n======== Airtable GET /v0/meta/bases (integration) ========',
    );

    console.log('Page count:', pages.length);
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];

      console.log(
        `\n--- Page ${i + 1} (request offset: ${p.pageOffset ?? 'null'}) ---`,
      );

      console.log(JSON.stringify(p.payload, null, 2));
    }

    console.log('======== end ========\n');

    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0].payload).toBeDefined();
  }, 60_000);
});
