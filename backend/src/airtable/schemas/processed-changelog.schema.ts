import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProcessedChangelogDocument = HydratedDocument<ProcessedChangelog>;

/**
 * Part C projection for raw-data grid.
 * Keys are intentionally aligned with requested columns.
 */
@Schema({ collection: 'processed_changelog', timestamps: true })
export class ProcessedChangelog {
  @Prop({ required: true })
  uuid!: string;

  @Prop({ required: true })
  issueId!: string;

  @Prop({ type: String, default: '' })
  authorUuid!: string;

  @Prop({ type: Date, required: true })
  created!: Date;

  @Prop({ type: String, default: '' })
  itemsField!: string;

  @Prop({ type: String, default: '' })
  itemsFieldType!: string;

  @Prop({ type: String, default: '' })
  itemsFieldId!: string;
}

export const ProcessedChangelogSchema =
  SchemaFactory.createForClass(ProcessedChangelog);

ProcessedChangelogSchema.index({ issueId: 1, uuid: 1 }, { unique: true });
