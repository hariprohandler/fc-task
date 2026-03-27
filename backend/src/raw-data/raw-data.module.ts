import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { RawDataRequestMiddleware } from './middleware/raw-data-request.middleware';
import { RawDataController } from './routes/raw-data.controller';
import { RawDataService } from './services/raw-data.service';

@Module({
  controllers: [RawDataController],
  providers: [RawDataService],
})
export class RawDataModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawDataRequestMiddleware)
      .forRoutes({ path: 'raw-data/(.*)', method: RequestMethod.ALL });
  }
}
