import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirtableOAuthTokenDocument = HydratedDocument<AirtableOAuthToken>;

@Schema({ collection: 'airtable_oauth_tokens', timestamps: true })
export class AirtableOAuthToken {
  /** Single integration instance for this app */
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ required: true })
  accessToken!: string;

  @Prop({ required: true })
  refreshToken!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  tokenType?: string;

  @Prop()
  scope?: string;
}

export const AirtableOAuthTokenSchema =
  SchemaFactory.createForClass(AirtableOAuthToken);
