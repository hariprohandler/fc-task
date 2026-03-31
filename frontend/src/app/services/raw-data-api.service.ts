import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface IntegrationDto {
  id: string;
  label: string;
  /** Shown in UI; disconnected integrations appear disabled in the dropdown. */
  connected: boolean;
}

export interface EntityDto {
  id: string;
  label: string;
}

export interface EntitiesResponse {
  entities: {
    rawEntities: EntityDto[];
    processedEntities: EntityDto[];
  };
}

export interface RowsResponse {
  fields: string[];
  rows: Record<string, string>[];
  totalInDb: number;
  truncated: boolean;
  collection: string;
  maxFetched: number;
  sortField?: string | null;
  sortDir?: 'asc' | 'desc';
}

export interface RawLogEventDto {
  id: string;
  timestamp: string;
  message: string;
  level: string;
}

export interface RawLogEventsResponse {
  logGroup: string;
  events: RawLogEventDto[];
}

@Injectable({ providedIn: 'root' })
export class RawDataApiService {
  private readonly http = inject(HttpClient);

  integrations() {
    return this.http.get<{ integrations: IntegrationDto[] }>(
      '/api/raw-data/integrations',
    );
  }

  entities(integrationId: string) {
    return this.http.get<EntitiesResponse>('/api/raw-data/entities', {
      params: { integrationId },
    });
  }

  rows(
    integrationId: string,
    collection: string,
    options?: { sortField?: string; sortDir?: 'asc' | 'desc' },
  ) {
    let params = new HttpParams()
      .set('integrationId', integrationId)
      .set('collection', collection);
    if (options?.sortField?.trim()) {
      params = params
        .set('sortField', options.sortField.trim())
        .set('sortDir', options.sortDir ?? 'asc');
    }
    return this.http.get<RowsResponse>('/api/raw-data/rows', {
      params,
    });
  }

  logGroups() {
    return this.http.get<{ groups: string[] }>('/api/raw-data/logs/groups');
  }

  logEvents(options: {
    logGroup: string;
    limit?: number;
    before?: string;
    after?: string;
    filter?: string;
  }) {
    let params = new HttpParams().set('logGroup', options.logGroup);
    if (options.limit != null) {
      params = params.set('limit', String(options.limit));
    }
    if (options.before) {
      params = params.set('before', options.before);
    }
    if (options.after) {
      params = params.set('after', options.after);
    }
    if (options.filter) {
      params = params.set('filter', options.filter);
    }
    return this.http.get<RawLogEventsResponse>('/api/raw-data/logs', {
      params,
    });
  }
}
