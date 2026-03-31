import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MAX_RAW_DOCUMENTS } from './raw-data.constants';
import { RawDataService } from './raw-data.service';
import { RawDataLogService } from './services/raw-data-log.service';

@Controller('raw-data')
export class RawDataController {
  constructor(
    private readonly rawData: RawDataService,
    private readonly rawLogs: RawDataLogService,
  ) {}

  @Get('integrations')
  async listIntegrations() {
    const integrations = await this.rawData.listIntegrations();
    return { integrations };
  }

  @Get('entities')
  async listEntities(@Query('integrationId') integrationId: string) {
    if (!integrationId?.trim()) {
      throw new BadRequestException('integrationId query required');
    }
    const entities = await this.rawData.listEntities(integrationId);
    return { entities };
  }

  @Get('rows')
  async getRows(
    @Query('integrationId') integrationId: string,
    @Query('collection') collection: string,
    @Query('limit') limitStr?: string,
    @Query('sortField') sortField?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    if (!integrationId?.trim() || !collection?.trim()) {
      throw new BadRequestException(
        'integrationId and collection query parameters are required',
      );
    }
    const parsed = limitStr ? Number.parseInt(limitStr, 10) : MAX_RAW_DOCUMENTS;
    const limit = Number.isFinite(parsed) ? parsed : MAX_RAW_DOCUMENTS;
    const normalizedSortField = sortField?.trim() || undefined;
    const normalizedSortDir =
      sortDir?.trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
    const data = await this.rawData.fetchCollectionRows(
      integrationId,
      collection,
      limit,
      normalizedSortField,
      normalizedSortDir,
    );
    return {
      integrationId,
      collection,
      maxFetched: MAX_RAW_DOCUMENTS,
      sortField: normalizedSortField ?? null,
      sortDir: normalizedSortDir,
      ...data,
    };
  }

  @Get('logs/groups')
  async logGroups() {
    const groups = await this.rawLogs.listLogGroups();
    return { groups };
  }

  @Get('logs')
  async logEvents(
    @Query('logGroup') logGroup: string,
    @Query('limit') limitStr?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @Query('filter') filter?: string,
  ) {
    if (!logGroup?.trim()) {
      throw new BadRequestException('logGroup query parameter is required');
    }
    const parsed = limitStr ? Number.parseInt(limitStr, 10) : undefined;
    const events = await this.rawLogs.queryEvents({
      logGroup: logGroup.trim(),
      limit: Number.isFinite(parsed) ? parsed : undefined,
      before: before?.trim() || undefined,
      after: after?.trim() || undefined,
      filter: filter?.trim() || undefined,
    });
    return { logGroup: logGroup.trim(), events };
  }
}
