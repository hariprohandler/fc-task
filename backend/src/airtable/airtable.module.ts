import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AirtableApiService } from './airtable-api.service';
import { AirtableOAuthService } from './airtable-oauth.service';
import { AirtableRevisionSyncService } from './airtable-revision-sync.service';
import { AirtableSyncService } from './airtable-sync.service';
import { AirtableWebSessionService } from './airtable-web-session.service';
import { AirtableOAuthController } from './oauth.controller';
import { AirtableRevisionController } from './revision.controller';
import { AirtableSyncController } from './sync.controller';
import { AirtableWebSessionController } from './web-session.controller';
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
export class AirtableModule {}
