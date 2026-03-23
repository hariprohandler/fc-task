import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirtableWebSessionDocument = HydratedDocument<AirtableWebSession>;

/** Latest browser session cookies for Airtable web (revision history, etc.). */
@Schema({ collection: 'airtable_web_sessions', timestamps: true })
export class AirtableWebSession {
  @Prop({ required: true, default: 'default' })
  key!: string;

  /** Raw `Cookie` header value for `fetch` to airtable.com. */
  @Prop({ required: true })
  cookieHeader!: string;

  @Prop({ type: Date, default: null })
  lastValidatedAt!: Date | null;

  @Prop({ type: Boolean, default: null })
  lastValidationOk!: boolean | null;
}

export const AirtableWebSessionSchema =
  SchemaFactory.createForClass(AirtableWebSession);

AirtableWebSessionSchema.index({ key: 1 }, { unique: true });
