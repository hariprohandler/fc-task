import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface AutoSyncCookiesResponse {
  ok: boolean;
  valid: boolean;
  cookieLength: number;
  preloadedUrl: string;
  cookieHeader: string;
}

@Injectable({ providedIn: 'root' })
export class AirtableSessionApiService {
  private readonly http = inject(HttpClient);

  saveCookies(cookieHeader: string) {
    return this.http.post('/api/airtable/web-session/cookies', { cookieHeader });
  }

  validateLight() {
    return this.http.post('/api/airtable/web-session/validate', {});
  }

  validateStrong(sample: { baseId: string; tableId: string; rowId: string }) {
    return this.http.post('/api/airtable/web-session/validate', { sample });
  }

  autoSyncCookies(options?: {
    preloadUrl?: string;
    timeoutMs?: number;
    browser?: 'chrome' | 'brave';
  }) {
    return this.http.post<AutoSyncCookiesResponse>(
      '/api/airtable/web-session/cookies/auto',
      options ?? {},
    );
  }
}
