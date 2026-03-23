import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AirtableUserSyncPageDocument =
  HydratedDocument<AirtableUserSyncPage>;

/** One document per paginated response from GET /v0/users */
@Schema({ collection: 'airtable_users_pages', timestamps: true })
export class AirtableUserSyncPage {
  @Prop({ type: String, default: null })
  pageOffset!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload!: Record<string, unknown>;
}

export const AirtableUserSyncPageSchema =
  SchemaFactory.createForClass(AirtableUserSyncPage);
