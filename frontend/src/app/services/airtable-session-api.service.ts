import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AirtableSessionApiService {
  private readonly http = inject(HttpClient);

  saveCookies(cookieHeader: string) {
    return this.http.post('/api/airtable/web-session/cookies', { cookieHeader });
  }

  beginLogin(email?: string, password?: string) {
    return this.http.post('/api/airtable/web-session/login/begin', {
      email: email || undefined,
      password: password || undefined,
    });
  }

  completeLogin(sessionKey: string, mfaCode: string) {
    return this.http.post('/api/airtable/web-session/login/complete', {
      sessionKey,
      mfaCode,
    });
  }

  validateLight() {
    return this.http.post('/api/airtable/web-session/validate', {});
  }

  validateStrong(sample: { baseId: string; tableId: string; rowId: string }) {
    return this.http.post('/api/airtable/web-session/validate', { sample });
  }
}
