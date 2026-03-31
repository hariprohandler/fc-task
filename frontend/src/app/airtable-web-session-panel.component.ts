import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AirtableSessionApiService } from './services/airtable-session-api.service';

@Component({
  selector: 'app-airtable-web-session-panel',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatButtonModule,
    MatDividerModule,
  ],
  template: `
    <mat-card class="panel">
      <mat-card-header>
        <mat-card-title>Airtable web session</mat-card-title>
        <mat-card-subtitle
          >Browser cookies for Airtable web revision history</mat-card-subtitle
        >
      </mat-card-header>
      <mat-card-content>
        <p class="hint">
          Uses <code>/api/airtable/web-session/*</code> via dev proxy (backend on port 3000).
        </p>
        @if (syncingAuto) {
          <mat-progress-bar mode="indeterminate" />
          <p class="hint">Sync in progress. Keep your browser signed in to Airtable.</p>
        }
        @if (alertMessage) {
          <div class="alert-banner">{{ alertMessage }}</div>
        }

        <h3 class="sub primary-path">Sync cookies automatically (recommended)</h3>
        <p class="hint">
          If you are already logged in to Airtable in Chrome/Brave, pick your browser, provide your table URL, and click
          <strong>Sync cookies (auto)</strong>.
        </p>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Browser</mat-label>
          <mat-select [(ngModel)]="syncBrowser">
            <mat-option value="brave">Brave</mat-option>
            <mat-option value="chrome">Chrome</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Airtable preload URL</mat-label>
          <input
            matInput
            [(ngModel)]="preloadUrl"
            placeholder="https://airtable.com/app.../tbl.../viw..."
          />
        </mat-form-field>
        <div class="row">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="syncingAuto"
            (click)="syncCookiesAuto()"
          >
            {{ syncingAuto ? 'Syncing cookies…' : 'Sync cookies (auto)' }}
          </button>
        </div>

        <mat-divider class="divider" />

        <h3 class="sub">Paste cookies manually</h3>
        <p class="hint">
          Sign in to <strong>airtable.com</strong>, open DevTools → Network → a request to airtable.com →
          copy the full <strong>Cookie</strong> request header, then paste below and save.
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
            Validate (revision API)
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
export class AirtableWebSessionPanelComponent implements OnInit {
  private readonly sessionApi = inject(AirtableSessionApiService);

  cookieHeader = '';
  preloadUrl =
    'https://airtable.com/appKBvrhRNRAlgMBz/tblv9RrRM7NuolUpK/viwmzS9Q8zQsbO6ML?blocks=hide';
  syncBrowser: 'chrome' | 'brave' = 'brave';
  sampleBaseId = '';
  sampleTableId = '';
  sampleRowId = '';
  message = '';
  alertMessage = '';
  syncingAuto = false;

  ngOnInit(): void {
    void this.detectBrowserAndPrefill();
  }

  private async detectBrowserAndPrefill(): Promise<void> {
    const nav = globalThis.navigator as Navigator & {
      brave?: { isBrave?: () => Promise<boolean> };
      userAgentData?: { brands?: { brand: string }[] };
    };

    try {
      if (typeof nav.brave?.isBrave === 'function') {
        const isBrave = await nav.brave.isBrave();
        this.syncBrowser = isBrave ? 'brave' : 'chrome';
        return;
      }
    } catch {
      // Ignore detection errors and fall back to UA checks.
    }

    const brands = nav.userAgentData?.brands?.map((b) => b.brand.toLowerCase()) ?? [];
    const ua = nav.userAgent.toLowerCase();
    const looksLikeBrave =
      brands.some((b) => b.includes('brave')) ||
      ua.includes('brave') ||
      ua.includes('brave/');

    this.syncBrowser = looksLikeBrave ? 'brave' : 'chrome';
  }

  syncCookiesAuto(): void {
    this.syncingAuto = true;
    this.sessionApi
      .autoSyncCookies({
        preloadUrl: this.preloadUrl.trim() || undefined,
        browser: this.syncBrowser,
      })
      .subscribe({
        next: (res) => {
          this.syncingAuto = false;
          this.alertMessage = '';
          if (res.cookieHeader?.trim()) {
            this.cookieHeader = res.cookieHeader;
          }
          this.message = JSON.stringify(res, null, 2);
        },
        error: (err) => {
          this.syncingAuto = false;
          this.handleError(err);
        },
      });
  }

  saveCookies(): void {
    this.sessionApi.saveCookies(this.cookieHeader).subscribe({
      next: (res) => {
        this.alertMessage = '';
        this.message = JSON.stringify(res, null, 2);
      },
      error: (err) => {
        this.handleError(err);
      },
    });
  }

  validateLight(): void {
    this.sessionApi.validateLight().subscribe({
      next: (res) => {
        this.alertMessage = '';
        this.message = JSON.stringify(res, null, 2);
      },
      error: (err) => {
        this.handleError(err);
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
          this.alertMessage = '';
          this.message = JSON.stringify(res, null, 2);
        },
        error: (err) => {
          this.handleError(err);
        },
      });
  }

  private handleError(err: { error?: unknown; message?: string }): void {
    this.message = this.formatErr(err);
    if (this.looksLikeCookieNotAvailable(err)) {
      this.alertMessage =
        'Cookie is not available. Configure it manually, or click Sync cookies (auto) in configuration to fetch and auto-populate the cookie.';
    } else {
      this.alertMessage = '';
    }
  }

  private formatErr(err: { error?: unknown; message?: string }): string {
    if (err?.error && typeof err.error === 'object') {
      return JSON.stringify(err.error, null, 2);
    }
    return err?.message ?? String(err);
  }

  private looksLikeCookieNotAvailable(err: { error?: unknown }): boolean {
    if (!err?.error || typeof err.error !== 'object') {
      return false;
    }
    const body = err.error as { error?: string; message?: string };
    if (body.error === 'COOKIE_NOT_VALID') {
      return true;
    }
    const msg = (body.message ?? '').toLowerCase();
    return msg.includes('cookie') && msg.includes('not') && msg.includes('valid');
  }
}
