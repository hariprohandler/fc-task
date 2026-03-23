import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AirtableWebLoginDraftDocument =
  HydratedDocument<AirtableWebLoginDraft>;

/**
 * Temporary Playwright storage state between password step and MFA step.
 * TTL index removes stale drafts automatically.
 */
@Schema({ collection: 'airtable_web_login_drafts', timestamps: true })
export class AirtableWebLoginDraft {
  @Prop({ required: true, unique: true })
  sessionKey!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  storageState!: Record<string, unknown>;

  @Prop({ required: true })
  lastUrl!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export const AirtableWebLoginDraftSchema = SchemaFactory.createForClass(
  AirtableWebLoginDraft,
);

AirtableWebLoginDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
