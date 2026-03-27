import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { AirtableSessionApiService } from './services/airtable-session-api.service';

@Component({
  selector: 'app-airtable-web-session-panel',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDividerModule,
  ],
  template: `
    <mat-card class="panel">
      <mat-card-header>
        <mat-card-title>Airtable web session</mat-card-title>
        <mat-card-subtitle
          >Browser cookies for revision history (not the API PAT)</mat-card-subtitle
        >
      </mat-card-header>
      <mat-card-content>
        <p class="hint">
          Uses <code>/api/airtable/web-session/*</code> via dev proxy (backend on port 3000).
        </p>

        <h3 class="sub primary-path">Google, Apple, or SSO sign-in</h3>
        <p class="hint">
          Airtable’s Google login happens on Google’s site, so this app cannot drive that flow
          with a password field. Sign in to
          <strong>airtable.com</strong> in Chrome, open DevTools → Network → any request to
          airtable.com → copy the full <strong>Cookie</strong> request header, then paste below.
        </p>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Cookie header (from DevTools)</mat-label>
          <textarea
            matInput
            rows="4"
            [(ngModel)]="cookieHeader"
            placeholder="brw=…; __Host-airtable-session=…"
          ></textarea>
        </mat-form-field>
        <div class="row">
          <button mat-flat-button color="primary" type="button" (click)="saveCookies()">
            Save cookies
          </button>
        </div>

        <mat-divider class="divider" />

        <h3 class="sub">Automated login (Airtable email + password only)</h3>
        <p class="hint">
          Optional Playwright flow for accounts that sign in with an <strong>email and password
          on Airtable’s own form</strong> (not “Continue with Google”). Requires
          <code>npx playwright install chromium</code> on the server.
        </p>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Email (or set AIRTABLE_WEB_LOGIN_EMAIL in backend .env)</mat-label>
          <input matInput type="email" [(ngModel)]="email" autocomplete="username" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Password (or set AIRTABLE_WEB_LOGIN_PASSWORD in backend .env)</mat-label>
          <input
            matInput
            type="password"
            [(ngModel)]="password"
            autocomplete="current-password"
          />
        </mat-form-field>

        <div class="row">
          <button mat-stroked-button type="button" (click)="beginLogin()">
            Begin login (Playwright)
          </button>
        </div>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Session key (only if MFA step returned one)</mat-label>
          <input matInput [(ngModel)]="sessionKey" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>MFA code</mat-label>
          <input matInput [(ngModel)]="mfaCode" inputmode="numeric" autocomplete="one-time-code" />
        </mat-form-field>
        <div class="row">
          <button mat-stroked-button type="button" (click)="completeLogin()">
            Complete login (MFA)
          </button>
        </div>

        <mat-divider class="divider" />

        <h3 class="sub">Validate cookies</h3>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Sample baseId</mat-label>
          <input matInput [(ngModel)]="sampleBaseId" placeholder="appXXXXXXXXXXXXXX" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Sample tableId</mat-label>
          <input matInput [(ngModel)]="sampleTableId" placeholder="tblXXXXXXXXXXXXXX" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Sample rowId</mat-label>
          <input matInput [(ngModel)]="sampleRowId" placeholder="recXXXXXXXXXXXXXX" />
        </mat-form-field>
        <div class="row">
          <button mat-button type="button" (click)="validateLight()">Validate (light)</button>
          <button mat-button type="button" (click)="validateStrong()">
            Validate (revision POST)
          </button>
        </div>

        @if (message) {
          <pre class="out">{{ message }}</pre>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .panel {
        max-width: 36rem;
        margin: 1rem auto;
      }
      .full {
        width: 100%;
        display: block;
        margin-top: 0.5rem;
      }
      .row {
        margin: 0.5rem 0 1rem;
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .hint {
        font-size: 0.875rem;
        color: rgba(0, 0, 0, 0.6);
      }
      .sub {
        margin: 1.25rem 0 0.25rem;
        font-size: 1rem;
        font-weight: 500;
      }
      .sub.primary-path {
        margin-top: 0.5rem;
        color: #1565c0;
      }
      .divider {
        margin: 1.25rem 0;
      }
      textarea {
        font-family: monospace;
        font-size: 12px;
      }
      .out {
        margin-top: 1rem;
        padding: 0.75rem;
        background: rgba(0, 0, 0, 0.04);
        border-radius: 4px;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.8rem;
      }
    `,
  ],
})
export class AirtableWebSessionPanelComponent {
  private readonly sessionApi = inject(AirtableSessionApiService);

  cookieHeader = '';
  email = '';
  password = '';
  mfaCode = '';
  sessionKey = '';
  sampleBaseId = '';
  sampleTableId = '';
  sampleRowId = '';
  message = '';

  saveCookies(): void {
    this.sessionApi
      .saveCookies(this.cookieHeader)
      .subscribe({
        next: (res) => {
          this.message = JSON.stringify(res, null, 2);
        },
        error: (err) => {
          this.message = this.formatErr(err);
        },
      });
  }

  beginLogin(): void {
    this.sessionApi
      .beginLogin(this.email, this.password)
      .subscribe({
        next: (res) => {
          this.message = JSON.stringify(res, null, 2);
          const r = res as { sessionKey?: string; mfaRequired?: boolean };
          if (r.mfaRequired && r.sessionKey) {
            this.sessionKey = r.sessionKey;
          }
        },
        error: (err) => {
          this.message = this.formatErr(err);
        },
      });
  }

  completeLogin(): void {
    this.sessionApi
      .completeLogin(this.sessionKey, this.mfaCode)
      .subscribe({
        next: (res) => {
          this.message = JSON.stringify(res, null, 2);
        },
        error: (err) => {
          this.message = this.formatErr(err);
        },
      });
  }

  validateLight(): void {
    this.sessionApi.validateLight().subscribe({
      next: (res) => {
        this.message = JSON.stringify(res, null, 2);
      },
      error: (err) => {
        this.message = this.formatErr(err);
      },
    });
  }

  validateStrong(): void {
    this.sessionApi
      .validateStrong({
        baseId: this.sampleBaseId,
        tableId: this.sampleTableId,
        rowId: this.sampleRowId,
      })
      .subscribe({
        next: (res) => {
          this.message = JSON.stringify(res, null, 2);
        },
        error: (err) => {
          this.message = this.formatErr(err);
        },
      });
  }

  private formatErr(err: { error?: unknown; message?: string }): string {
    if (err?.error && typeof err.error === 'object') {
      return JSON.stringify(err.error, null, 2);
    }
    return err?.message ?? String(err);
  }
}
