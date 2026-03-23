import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AirtableApiService } from './airtable-api.service';
import { AirtableOAuthService } from './airtable-oauth.service';
import { AirtableSyncService } from './airtable-sync.service';
import { AirtableOAuthController } from './oauth.controller';
import { AirtableSyncController } from './sync.controller';
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
    ]),
  ],
  controllers: [AirtableOAuthController, AirtableSyncController],
  providers: [AirtableOAuthService, AirtableApiService, AirtableSyncService],
  exports: [AirtableOAuthService, AirtableApiService, AirtableSyncService],
})
export class AirtableModule {}
