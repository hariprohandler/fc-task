import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AirtableWebSessionPanelComponent } from './airtable-web-session-panel.component';

@Component({
  selector: 'app-airtable-session-page',
  standalone: true,
  imports: [
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    AirtableWebSessionPanelComponent,
  ],
  template: `
    <mat-toolbar color="primary">
      <a mat-button routerLink="/" class="back">← Raw Data</a>
    </mat-toolbar>
    <app-airtable-web-session-panel />
  `,
  styles: [
    `
      .back {
        color: inherit;
      }
    `,
  ],
})
export class AirtableSessionPageComponent {}
