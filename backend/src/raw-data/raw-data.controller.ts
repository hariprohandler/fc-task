import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { RawDataService } from './raw-data.service';
import { MAX_RAW_DOCUMENTS } from './raw-data.constants';

@Controller('raw-data')
export class RawDataController {
  constructor(private readonly rawData: RawDataService) {}

  @Get('integrations')
  listIntegrations() {
    return { integrations: this.rawData.listIntegrations() };
  }

  @Get('entities')
  listEntities(@Query('integrationId') integrationId: string) {
    if (!integrationId?.trim()) {
      throw new BadRequestException('integrationId query required');
    }
    return { entities: this.rawData.listEntities(integrationId) };
  }

  @Get('rows')
  async getRows(
    @Query('integrationId') integrationId: string,
    @Query('collection') collection: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!integrationId?.trim() || !collection?.trim()) {
      throw new BadRequestException(
        'integrationId and collection query parameters are required',
      );
    }
    const parsed = limitStr ? Number.parseInt(limitStr, 10) : MAX_RAW_DOCUMENTS;
    const limit = Number.isFinite(parsed) ? parsed : MAX_RAW_DOCUMENTS;
    const data = await this.rawData.fetchCollectionRows(
      integrationId,
      collection,
      limit,
    );
    return {
      integrationId,
      collection,
      maxFetched: MAX_RAW_DOCUMENTS,
      ...data,
    };
  }
}
