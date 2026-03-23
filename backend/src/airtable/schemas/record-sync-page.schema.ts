import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AirtableRecordSyncPageDocument =
  HydratedDocument<AirtableRecordSyncPage>;

/** One document per paginated response from GET /v0/:baseId/:tableId */
@Schema({ collection: 'airtable_records_pages', timestamps: true })
export class AirtableRecordSyncPage {
  @Prop({ required: true })
  baseId!: string;

  @Prop({ required: true })
  tableId!: string;

  @Prop({ type: String, default: null })
  pageOffset!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload!: Record<string, unknown>;
}

export const AirtableRecordSyncPageSchema = SchemaFactory.createForClass(
  AirtableRecordSyncPage,
);

AirtableRecordSyncPageSchema.index({ baseId: 1, tableId: 1, pageOffset: 1 });
