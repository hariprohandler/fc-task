import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AirtableBaseSyncPageDocument =
  HydratedDocument<AirtableBaseSyncPage>;

/** One document per paginated response from GET /v0/meta/bases */
@Schema({ collection: 'airtable_bases_pages', timestamps: true })
export class AirtableBaseSyncPage {
  /** Request offset query value used for this page (null/undefined = first page) */
  @Prop({ type: String, default: null })
  pageOffset!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload!: Record<string, unknown>;
}

export const AirtableBaseSyncPageSchema =
  SchemaFactory.createForClass(AirtableBaseSyncPage);
