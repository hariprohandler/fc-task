import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface IntegrationDto {
  id: string;
  label: string;
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

  rows(integrationId: string, collection: string) {
    return this.http.get<RowsResponse>('/api/raw-data/rows', {
      params: { integrationId, collection },
    });
  }
}
