import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AirtableTableSyncPageDocument =
  HydratedDocument<AirtableTableSyncPage>;

/** One document per paginated response from GET /v0/meta/bases/:baseId/tables */
@Schema({ collection: 'airtable_tables_pages', timestamps: true })
export class AirtableTableSyncPage {
  @Prop({ required: true })
  baseId!: string;

  @Prop({ type: String, default: null })
  pageOffset!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload!: Record<string, unknown>;
}

export const AirtableTableSyncPageSchema = SchemaFactory.createForClass(
  AirtableTableSyncPage,
);

AirtableTableSyncPageSchema.index({ baseId: 1, pageOffset: 1 });
