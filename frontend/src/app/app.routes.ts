import { Routes } from '@angular/router';
import { AirtableSessionPageComponent } from './airtable-session-page.component';
import { RawDataComponent } from './raw-data/raw-data.component';
import { RawDataLogsComponent } from './raw-data/raw-data-logs.component';

export const routes: Routes = [
  { path: '', component: RawDataComponent },
  { path: 'logs', component: RawDataLogsComponent },
  { path: 'airtable-session', component: AirtableSessionPageComponent },
  { path: '**', redirectTo: '' },
];
