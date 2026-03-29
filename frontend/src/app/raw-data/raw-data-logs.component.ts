import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Subject, Subscription, debounceTime } from 'rxjs';
import {
  RawDataApiService,
  type RawLogEventDto,
} from '../services/raw-data-api.service';

const DEFAULT_GROUP = 'airtable/sync';
const POLL_MS = 4000;

@Component({
  selector: 'app-raw-data-logs',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './raw-data-logs.component.html',
  styleUrl: './raw-data-logs.component.scss',
})
export class RawDataLogsComponent implements OnInit, OnDestroy {
  private readonly api = inject(RawDataApiService);
  private readonly filterTrigger = new Subject<void>();
  private filterSub?: Subscription;
  private pollTimer?: ReturnType<typeof setInterval>;

  protected readonly eventsScroll =
    viewChild<ElementRef<HTMLElement>>('eventsScroll');

  protected readonly groups = signal<string[]>([DEFAULT_GROUP]);
  protected readonly selectedGroup = signal<string>(DEFAULT_GROUP);
  protected readonly events = signal<RawLogEventDto[]>([]);
  protected readonly filterText = signal<string>('');
  protected readonly autoRefresh = signal<boolean>(true);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadGroups();
    this.refresh();

    this.filterSub = this.filterTrigger
      .pipe(debounceTime(400))
      .subscribe(() => this.refresh());

    this.pollTimer = setInterval(() => {
      if (this.autoRefresh()) {
        this.pollTail();
      }
    }, POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.filterSub?.unsubscribe();
    this.filterTrigger.complete();
  }

  protected onGroupChange(group: string): void {
    this.selectedGroup.set(group);
    this.refresh();
  }

  protected onFilterChange(value: string): void {
    this.filterText.set(value);
    this.filterTrigger.next();
  }

  protected clearFilter(): void {
    this.filterText.set('');
    this.refresh();
  }

  protected setAutoRefresh(enabled: boolean): void {
    this.autoRefresh.set(enabled);
  }

  protected refresh(): void {
    const logGroup = this.selectedGroup();
    this.loading.set(true);
    this.error.set(null);
    this.api
      .logEvents({
        logGroup,
        limit: 200,
        filter: this.filterText().trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.events.set(res.events);
          this.loading.set(false);
          queueMicrotask(() => this.scrollToBottom());
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(this.formatHttpError(err));
        },
      });
  }

  protected loadOlder(): void {
    const list = this.events();
    const first = list[0];
    if (!first) {
      return;
    }
    this.loadingMore.set(true);
    this.error.set(null);
    this.api
      .logEvents({
        logGroup: this.selectedGroup(),
        limit: 200,
        before: first.timestamp,
        filter: this.filterText().trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          const existing = new Set(list.map((e) => e.id));
          const older = res.events.filter((e) => !existing.has(e.id));
          this.events.set([...older, ...list]);
          this.loadingMore.set(false);
        },
        error: (err: unknown) => {
          this.loadingMore.set(false);
          this.error.set(this.formatHttpError(err));
        },
      });
  }

  private pollTail(): void {
    if (this.loading()) {
      return;
    }
    const list = this.events();
    const last = list[list.length - 1];
    if (!last) {
      return;
    }
    this.api
      .logEvents({
        logGroup: this.selectedGroup(),
        limit: 100,
        after: last.timestamp,
        filter: this.filterText().trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          const existing = new Set(list.map((e) => e.id));
          const newer = res.events.filter((e) => !existing.has(e.id));
          if (newer.length === 0) {
            return;
          }
          this.events.set([...list, ...newer]);
          queueMicrotask(() => this.scrollToBottom());
        },
        error: () => {
          /* live tail is best-effort */
        },
      });
  }

  private loadGroups(): void {
    this.api.logGroups().subscribe({
      next: (res) => {
        const merged = [...new Set([...res.groups, DEFAULT_GROUP])].sort();
        this.groups.set(merged);
        const cur = this.selectedGroup();
        if (!merged.includes(cur)) {
          this.selectedGroup.set(merged[0] ?? DEFAULT_GROUP);
        }
      },
      error: () => {
        this.groups.set([DEFAULT_GROUP]);
      },
    });
  }

  private scrollToBottom(): void {
    const el = this.eventsScroll()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  private formatHttpError(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const e = err as { error?: { message?: string } };
      if (e.error?.message) {
        return e.error.message;
      }
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Failed to load logs';
  }
}
