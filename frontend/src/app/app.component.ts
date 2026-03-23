import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AirtableWebSessionPanelComponent } from './airtable-web-session-panel.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AirtableWebSessionPanelComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'frontend';
}
