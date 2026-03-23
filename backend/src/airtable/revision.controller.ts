import { Controller, Get, Post, Query, Body } from '@nestjs/common';
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
