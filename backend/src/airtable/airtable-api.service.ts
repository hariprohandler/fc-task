import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readOffset } from './airtable-pagination.util';
import { AirtableOAuthService } from './airtable-oauth.service';

@Injectable()
export class AirtableApiService {
  constructor(
    private readonly config: ConfigService,
    private readonly oauth: AirtableOAuthService,
  ) {}

  private get apiBase(): string {
    return this.config
      .getOrThrow<string>('airtable.apiBase')
      .replace(/\/$/, '');
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | undefined>,
  ): string {
    const base = this.apiBase;
    const rel = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(base + rel);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') {
          url.searchParams.set(k, v);
        }
      }
    }
    return url.toString();
  }

  async requestJson(
    path: string,
    query?: Record<string, string | undefined>,
    retried = false,
  ): Promise<Record<string, unknown>> {
    const token = await this.oauth.getValidAccessToken();
    const url = this.buildUrl(path, query);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (res.status === 401 && !retried) {
      await this.oauth.refreshAccessToken();
      return this.requestJson(path, query, true);
    }
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      throw new HttpException(
        typeof body === 'object' && body !== null ? body : text.slice(0, 500),
        res.status,
      );
    }
    return body as Record<string, unknown>;
  }

  /** Paginate any endpoint that returns `offset` for the next page. */
  async fetchAllPages(
    path: string,
    extraQuery?: Record<string, string | undefined>,
  ): Promise<
    Array<{ pageOffset: string | null; payload: Record<string, unknown> }>
  > {
    const pages: Array<{
      pageOffset: string | null;
      payload: Record<string, unknown>;
    }> = [];
    let offset: string | undefined;
    do {
      const query: Record<string, string | undefined> = {
        ...extraQuery,
        ...(offset ? { offset } : {}),
      };
      const payload = await this.requestJson(path, query);
      pages.push({ pageOffset: offset ?? null, payload });
      offset = readOffset(payload);
    } while (offset);
    return pages;
  }

  /** GET /meta/bases */
  async listBasesPages() {
    return this.fetchAllPages('/meta/bases');
  }

  /** GET /meta/bases/:baseId/tables */
  async listTablesPages(baseId: string) {
    return this.fetchAllPages(
      `/meta/bases/${encodeURIComponent(baseId)}/tables`,
    );
  }

  /** GET /:baseId/:tableId — records (max pageSize 100) */
  async listRecordsPages(baseId: string, tableId: string) {
    const path = `/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`;
    return this.fetchAllPages(path, { pageSize: '100' });
  }

  /** GET /users */
  async listUsersPages() {
    return this.fetchAllPages('/users');
  }
}
