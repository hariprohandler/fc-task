import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
} from 'ag-grid-community';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  EntityDto,
  IntegrationDto,
  RawDataApiService,
} from '../services/raw-data-api.service';

@Component({
  selector: 'app-raw-data',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
    AgGridAngular,
  ],
  templateUrl: './raw-data.component.html',
  styleUrl: './raw-data.component.scss',
})
export class RawDataComponent implements OnInit {
  private readonly rawDataApi = inject(RawDataApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly snackBar = inject(MatSnackBar);

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  integrations: IntegrationDto[] = [];
  rawEntities: EntityDto[] = [];
  processedEntities: EntityDto[] = [];
  selectedIntegrationId = 'airtable';
  selectedEntityId: string | null = null;
  /** When set, this collection is loaded (overrides Entity). */
  selectedProcessedEntityId = '';

  searchText = '';
  loading = false;
  error: string | null = null;
  statusLine = '';

  /** Field names from last load (no row # column). */
  dataFields: string[] = [];
  columnVisibility: Record<string, boolean> = {};
  columnDefs: ColDef[] = [];
  rowData: Record<string, string>[] = [];

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: 'agTextColumnFilter',
    /** No second header row; filter via ⋮ → Filter tab and/or header funnel icon. */
    floatingFilter: false,
    /** Honoured when `columnMenu: 'legacy'` (default `'new'` ignores menu tabs). */
    menuTabs: ['filterMenuTab', 'generalMenuTab'],
    resizable: true,
    minWidth: 112,
    flex: 1,
    tooltipValueGetter: (p) => (p.value == null ? '' : String(p.value)),
  };

  readonly gridOptions = {
    /** Restores tabbed column menu so the Filter tab appears (AG Grid v33 default is `'new'`). */
    columnMenu: 'legacy' as const,
    /** Legacy menu hides ⋮ until hover; keep it visible for discoverability. */
    suppressMenuHide: true,
    enableBrowserTooltips: true,
    enableCellTextSelection: true,
    suppressCellFocus: true,
    animateRows: true,
    pagination: true,
    paginationPageSize: 100,
    paginationPageSizeSelector: [25, 50, 100, 200, 500],
    rowSelection: {
      mode: 'multiRow' as const,
      checkboxes: true,
      headerCheckbox: true,
      enableClickSelection: false,
    },
    selectionColumnDef: {
      sortable: false,
      filter: false,
      floatingFilter: false,
      suppressHeaderMenuButton: true,
      suppressHeaderFilterButton: true,
      resizable: false,
    },
  };

  private gridApi: GridApi | null = null;
  selectedRowCount = 0;

  ngOnInit(): void {
    this.loadIntegrations();
  }

  get effectiveCollectionId(): string | null {
    const p = this.selectedProcessedEntityId?.trim();
    if (p) {
      return p;
    }
    return this.selectedEntityId;
  }

  loadIntegrations(): void {
    this.rawDataApi
      .integrations()
      .subscribe({
        next: (res) => {
          this.integrations = res.integrations ?? [];
          if (!this.selectedIntegrationId && this.integrations[0]) {
            this.selectedIntegrationId = this.integrations[0].id;
          }
          this.loadEntities();
        },
        error: () => {
          this.error = 'Failed to load integrations.';
        },
      });
  }

  loadEntities(): void {
    if (!this.selectedIntegrationId) {
      return;
    }
    this.rawDataApi
      .entities(this.selectedIntegrationId)
      .subscribe({
        next: (res) => {
          const e = res.entities;
          this.rawEntities = e?.rawEntities ?? [];
          this.processedEntities = e?.processedEntities ?? [];
          this.selectedEntityId = this.rawEntities[0]?.id ?? null;
          this.selectedProcessedEntityId = '';
          this.clearGridState();
          this.error = null;
        },
        error: () => {
          this.error = 'Failed to load collections.';
        },
      });
  }

  onIntegrationChange(): void {
    this.loadEntities();
  }

  clearGridState(): void {
    this.rowData = [];
    this.columnDefs = [];
    this.dataFields = [];
    this.columnVisibility = {};
    this.statusLine = '';
    this.searchText = '';
    this.gridApi?.setGridOption('quickFilterText', '');
    this.selectedRowCount = 0;
  }

  newGrid(): void {
    this.clearGridState();
    this.snackBar.open('New grid — choose Entity / Processed Entity and Load grid.', 'OK', {
      duration: 3500,
    });
  }

  newGlobalSearchGrid(): void {
    this.clearGridState();
    this.snackBar.open('Global search grid — use Search after loading data.', 'OK', {
      duration: 3500,
    });
    setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 0);
  }

  deleteGrid(): void {
    this.clearGridState();
    this.snackBar.open('Grid cleared.', 'OK', { duration: 2500 });
  }

  refreshGrid(): void {
    const coll = this.effectiveCollectionId;
    if (!coll || !this.selectedIntegrationId) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.rawDataApi
      .rows(this.selectedIntegrationId, coll)
      .subscribe({
        next: (res) => {
          this.loading = false;
          const fields = res.fields ?? [];
          this.dataFields = fields;
          this.columnVisibility = Object.fromEntries(
            fields.map((f) => [f, true]),
          );
          this.rowData = res.rows ?? [];
          this.columnDefs = this.buildColumnDefs(fields);
          const n = this.rowData.length;
          const total = res.totalInDb ?? n;
          this.statusLine = res.truncated
            ? `${n} rows loaded (cap ${res.maxFetched}; ~${total} in DB).`
            : `${n} row(s) (~${total} in DB).`;
          this.applyQuickFilter();
          this.selectedRowCount = 0;
          this.cdr.markForCheck();
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.loading = false;
          const m = err?.error?.message;
          this.error = Array.isArray(m)
            ? m.join(', ')
            : (m ?? 'Failed to load collection documents.');
        },
      });
  }

  private buildColumnDefs(fields: string[]): ColDef[] {
    const indexCol: ColDef = {
      colId: '__idx',
      headerName: '',
      width: 56,
      maxWidth: 64,
      pinned: 'left',
      sortable: false,
      filter: false,
      suppressHeaderMenuButton: true,
      suppressMovable: true,
      resizable: false,
      valueGetter: (p) => {
        if (p.node?.rowIndex == null) {
          return '';
        }
        const api = p.api;
        const page = api.paginationGetCurrentPage();
        const size = api.paginationGetPageSize();
        return String(page * size + p.node.rowIndex + 1);
      },
    };
    const dataCols: ColDef[] = fields.map((field) => ({
      field,
      headerName: field,
      hide: !this.columnVisibility[field],
    }));
    return [indexCol, ...dataCols];
  }

  onColumnToggle(field: string, visible: boolean): void {
    this.columnVisibility[field] = visible;
    this.gridApi?.setColumnsVisible([field], visible);
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.applyQuickFilter();
    event.api.addEventListener('selectionChanged', () => {
      this.selectedRowCount = event.api.getSelectedRows().length;
      this.cdr.markForCheck();
    });
    event.api.addEventListener('paginationChanged', () => {
      this.cdr.markForCheck();
    });
  }

  onSearchInput(): void {
    this.applyQuickFilter();
  }

  private applyQuickFilter(): void {
    this.gridApi?.setGridOption('quickFilterText', this.searchText.trim());
  }

  selectedRowsLabel(): string {
    return `Rows Selected ${this.selectedRowCount}`;
  }
}
