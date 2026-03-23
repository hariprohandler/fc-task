import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-raw-data-logs',
  standalone: true,
  imports: [RouterLink, MatButtonModule],
  template: `
    <div class="wrap">
      <a mat-button routerLink="/">← Raw Data</a>
      <h1>Raw Data Logs</h1>
      <p>
        Placeholder for sync / scrape job logs. Today, check the NestJS server
        console and MongoDB collections loaded via <strong>Load grid</strong>.
      </p>
    </div>
  `,
  styles: [
    `
      .wrap {
        padding: 24px;
        max-width: 640px;
      }
      h1 {
        font-size: 1.5rem;
        font-weight: 500;
        margin: 16px 0 8px;
      }
      p {
        color: #5f6368;
        line-height: 1.5;
      }
    `,
  ],
})
export class RawDataLogsComponent {}
