import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RawDataLog,
  type RawDataLogDocument,
} from '../schemas/raw-data-log.schema';

const MAX_LIMIT = 500;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type RawLogEventDto = {
  id: string;
  timestamp: string;
  message: string;
  level: string;
};

@Injectable()
export class RawDataLogService {
  private readonly logger = new Logger(RawDataLogService.name);

  constructor(
    @InjectModel(RawDataLog.name)
    private readonly model: Model<RawDataLogDocument>,
  ) {}

  async append(
    logGroup: string,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
  ): Promise<void> {
    try {
      await this.model.create({ logGroup, message, level });
    } catch (e) {
      this.logger.warn(
        `Failed to persist raw log (${logGroup}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async listLogGroups(): Promise<string[]> {
    const groups = await this.model.distinct('logGroup');
    return groups.filter(Boolean).sort();
  }

  async queryEvents(options: {
    logGroup: string;
    limit?: number;
    /** ISO — return events strictly older than this (for loading earlier history) */
    before?: string;
    /** ISO — return events strictly newer than this (for live tail) */
    after?: string;
    /** Case-insensitive substring on message */
    filter?: string;
  }): Promise<RawLogEventDto[]> {
    const limit = Math.min(
      Math.max(Number(options.limit) || 200, 1),
      MAX_LIMIT,
    );
    const { logGroup, before, after, filter } = options;

    const query: Record<string, unknown> = { logGroup };
    if (filter?.trim()) {
      query.message = {
        $regex: escapeRegex(filter.trim()),
        $options: 'i',
      };
    }
    if (before) {
      const d = new Date(before);
      if (!Number.isNaN(d.getTime())) {
        query.createdAt = { ...(query.createdAt as object), $lt: d };
      }
    }
    if (after) {
      const d = new Date(after);
      if (!Number.isNaN(d.getTime())) {
        query.createdAt = { ...(query.createdAt as object), $gt: d };
      }
    }

    if (after && !before) {
      const docs = await this.model
        .find(query)
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean()
        .exec();
      return docs.map((d) => this.toDto(d));
    }

    const docs = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.reverse().map((d) => this.toDto(d));
  }

  private toDto(doc: {
    _id: unknown;
    createdAt?: Date;
    message: string;
    level: string;
  }): RawLogEventDto {
    return {
      id: String(doc._id),
      timestamp: (doc.createdAt ?? new Date()).toISOString(),
      message: doc.message,
      level: doc.level,
    };
  }
}
