import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RawDataLogDocument = HydratedDocument<RawDataLog>;

@Schema({
  collection: 'raw_data_logs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class RawDataLog {
  /** CloudWatch-style path, e.g. airtable/sync */
  @Prop({ type: String, required: true, index: true })
  logGroup!: string;

  @Prop({ type: String, required: true })
  message!: string;

  @Prop({ type: String, enum: ['info', 'warn', 'error'], default: 'info' })
  level!: 'info' | 'warn' | 'error';
}

export const RawDataLogSchema = SchemaFactory.createForClass(RawDataLog);

RawDataLogSchema.index({ logGroup: 1, createdAt: -1 });
