import { Controller, Post } from '@nestjs/common';
import { AirtableSyncService } from './airtable-sync.service';

@Controller('airtable/sync')
export class AirtableSyncController {
  constructor(private readonly sync: AirtableSyncService) {}

  /** Pull all bases, tables, record pages, and users (with pagination) into MongoDB. */
  @Post()
  async runSync() {
    const summary = await this.sync.syncAll();
    return { ok: true, summary };
  }
}
