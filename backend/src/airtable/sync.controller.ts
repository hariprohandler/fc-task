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

  /** Part A explicit endpoint: sync bases pages only. */
  @Post('bases')
  async runBasesSync() {
    const summary = await this.sync.syncBasesOnly();
    return { ok: true, summary };
  }

  /** Part A explicit endpoint: sync base table metadata pages only. */
  @Post('tables')
  async runTablesSync() {
    const summary = await this.sync.syncTablesOnly();
    return { ok: true, summary };
  }

  /** Part A explicit endpoint: sync records pages only. */
  @Post('records')
  async runRecordsSync() {
    const summary = await this.sync.syncRecordsOnly();
    return { ok: true, summary };
  }

  /** Part A explicit endpoint: sync users pages only. */
  @Post('users')
  async runUsersSync() {
    const summary = await this.sync.syncUsersOnly();
    return { ok: true, summary };
  }
}
