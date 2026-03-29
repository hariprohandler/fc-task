import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { createCookieNotValidException } from './airtable-cookie-not-valid.exception';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AirtableRevisionSyncService } from './airtable-revision-sync.service';
import type { RevisionSyncOptions } from './airtable-revision-sync.service';
import {
  AirtableRevisionEntry,
  AirtableRevisionEntryDocument,
} from './schemas/revision-entry.schema';

@Controller('airtable/revision')
export class AirtableRevisionController {
  constructor(
    private readonly revisionSync: AirtableRevisionSyncService,
    @InjectModel(AirtableRevisionEntry.name)
    private readonly entries: Model<AirtableRevisionEntryDocument>,
  ) {}

  @Post('sync')
  async runSync(@Body() body: RevisionSyncOptions) {
    const summary = await this.revisionSync.syncRevisionHistory(body ?? {});
    return { ok: true, summary };
  }

  @Post('fetch')
  async fetchOne(
    @Body() body: { baseId?: string; tableId?: string; rowId?: string },
  ) {
    const baseId = body?.baseId?.trim();
    const tableId = body?.tableId?.trim();
    const rowId = body?.rowId?.trim();
    if (!baseId || !tableId || !rowId) {
      throw new BadRequestException('baseId, tableId, and rowId are required');
    }
    const r = await this.revisionSync.debugFetchRevision(
      baseId,
      tableId,
      rowId,
    );
    if (r.status === 401 || r.status === 403) {
      throw createCookieNotValidException({
        airtableHttpStatus: r.status,
      });
    }
    return {
      ok: r.status === 200,
      status: r.status,
      url: r.url,
      bodyLength: r.body.length,
      bodyPreview: r.body.slice(0, 12_000),
    };
  }

  @Get('entries')
  async list(
    @Query('issueId') issueId?: string,
    @Query('baseId') baseId?: string,
    @Query('limit') limit?: string,
  ) {
    const q: Record<string, string> = {};
    if (issueId) {
      q.issueId = issueId;
    }
    if (baseId) {
      q.baseId = baseId;
    }
    const lim = Math.min(500, Math.max(1, Number(limit) || 100));
    const rows = await this.entries
      .find(q)
      .sort({ createdDate: -1 })
      .limit(lim)
      .lean();
    return { count: rows.length, entries: rows };
  }
}
