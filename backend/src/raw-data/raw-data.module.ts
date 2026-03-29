import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RawDataRequestMiddleware } from './middleware/raw-data-request.middleware';
import { RawDataController } from './routes/raw-data.controller';
import { RawDataLog, RawDataLogSchema } from './schemas/raw-data-log.schema';
import { RawDataLogService } from './services/raw-data-log.service';
import { RawDataService } from './services/raw-data.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RawDataLog.name, schema: RawDataLogSchema },
    ]),
  ],
  controllers: [RawDataController],
  providers: [RawDataService, RawDataLogService],
  exports: [RawDataLogService],
})
export class RawDataModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawDataRequestMiddleware)
      .forRoutes({ path: 'raw-data/(.*)', method: RequestMethod.ALL });
  }
}
