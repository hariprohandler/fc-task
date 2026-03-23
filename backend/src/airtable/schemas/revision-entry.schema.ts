import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirtableRevisionEntryDocument =
  HydratedDocument<AirtableRevisionEntry>;

/** One revision activity (Assignee / Status change) parsed from web HTML. */
@Schema({ collection: 'airtable_revision_entries', timestamps: true })
export class AirtableRevisionEntry {
  @Prop({ required: true })
  uuid!: string;

  @Prop({ required: true })
  issueId!: string;

  @Prop({ required: true })
  columnType!: string;

  @Prop({ type: String, default: '' })
  oldValue!: string;

  @Prop({ type: String, default: '' })
  newValue!: string;

  @Prop({ type: Date, required: true })
  createdDate!: Date;

  @Prop({ type: String, default: '' })
  authoredBy!: string;

  @Prop({ required: true })
  baseId!: string;

  @Prop({ required: true })
  tableId!: string;
}

export const AirtableRevisionEntrySchema = SchemaFactory.createForClass(
  AirtableRevisionEntry,
);

AirtableRevisionEntrySchema.index({ issueId: 1, uuid: 1 }, { unique: true });
AirtableRevisionEntrySchema.index({ baseId: 1, tableId: 1 });
