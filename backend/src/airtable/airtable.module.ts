import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AirtableRequestMiddleware } from './middleware/airtable-request.middleware';
import { AirtableOAuthController } from './routes/oauth.controller';
import { AirtableRevisionController } from './routes/revision.controller';
import { AirtableSyncController } from './routes/sync.controller';
import { AirtableWebSessionController } from './routes/web-session.controller';
import { AirtableApiService } from './services/airtable-api.service';
import { AirtableOAuthService } from './services/airtable-oauth.service';
import { AirtableRevisionSyncService } from './services/airtable-revision-sync.service';
import { AirtableSyncService } from './services/airtable-sync.service';
import { AirtableWebSessionService } from './services/airtable-web-session.service';
import {
  AirtableBaseSyncPage,
  AirtableBaseSyncPageSchema,
} from './schemas/base-sync-page.schema';
import {
  AirtableOAuthState,
  AirtableOAuthStateSchema,
} from './schemas/oauth-state.schema';
import {
  AirtableOAuthToken,
  AirtableOAuthTokenSchema,
} from './schemas/oauth-token.schema';
import {
  AirtableRecordSyncPage,
  AirtableRecordSyncPageSchema,
} from './schemas/record-sync-page.schema';
import {
  AirtableTableSyncPage,
  AirtableTableSyncPageSchema,
} from './schemas/table-sync-page.schema';
import {
  AirtableUserSyncPage,
  AirtableUserSyncPageSchema,
} from './schemas/user-sync-page.schema';
import {
  AirtableRevisionEntry,
  AirtableRevisionEntrySchema,
} from './schemas/revision-entry.schema';
import {
  AirtableWebLoginDraft,
  AirtableWebLoginDraftSchema,
} from './schemas/web-login-draft.schema';
import {
  AirtableWebSession,
  AirtableWebSessionSchema,
} from './schemas/web-session.schema';
import {
  ProcessedChangelog,
  ProcessedChangelogSchema,
} from './schemas/processed-changelog.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AirtableOAuthToken.name, schema: AirtableOAuthTokenSchema },
      { name: AirtableOAuthState.name, schema: AirtableOAuthStateSchema },
      { name: AirtableBaseSyncPage.name, schema: AirtableBaseSyncPageSchema },
      { name: AirtableTableSyncPage.name, schema: AirtableTableSyncPageSchema },
      {
        name: AirtableRecordSyncPage.name,
        schema: AirtableRecordSyncPageSchema,
      },
      { name: AirtableUserSyncPage.name, schema: AirtableUserSyncPageSchema },
      { name: AirtableWebSession.name, schema: AirtableWebSessionSchema },
      { name: AirtableWebLoginDraft.name, schema: AirtableWebLoginDraftSchema },
      {
        name: AirtableRevisionEntry.name,
        schema: AirtableRevisionEntrySchema,
      },
      {
        name: ProcessedChangelog.name,
        schema: ProcessedChangelogSchema,
      },
    ]),
  ],
  controllers: [
    AirtableOAuthController,
    AirtableSyncController,
    AirtableWebSessionController,
    AirtableRevisionController,
  ],
  providers: [
    AirtableOAuthService,
    AirtableApiService,
    AirtableSyncService,
    AirtableWebSessionService,
    AirtableRevisionSyncService,
  ],
  exports: [
    AirtableOAuthService,
    AirtableApiService,
    AirtableSyncService,
    AirtableWebSessionService,
    AirtableRevisionSyncService,
  ],
})
export class AirtableModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AirtableRequestMiddleware)
      .forRoutes({ path: 'airtable/(.*)', method: RequestMethod.ALL });
  }
}
