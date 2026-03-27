import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Lightweight middleware hook for Airtable routes.
 * Kept intentionally minimal for observability/extensions.
 */
@Injectable()
export class AirtableRequestMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    next();
  }
}
