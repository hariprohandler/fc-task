import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirtableOAuthStateDocument = HydratedDocument<AirtableOAuthState>;

@Schema({ collection: 'airtable_oauth_state', timestamps: true })
export class AirtableOAuthState {
  @Prop({ required: true, unique: true })
  state!: string;

  @Prop({ required: true })
  codeVerifier!: string;
}

export const AirtableOAuthStateSchema =
  SchemaFactory.createForClass(AirtableOAuthState);

AirtableOAuthStateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });
