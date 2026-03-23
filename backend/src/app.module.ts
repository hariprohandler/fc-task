import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AirtableModule } from './airtable/airtable.module';
import airtableConfig from './airtable/airtable.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [airtableConfig],
      envFilePath: ['.env', '.env.local'],
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/fc_task',
    ),
    AirtableModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
