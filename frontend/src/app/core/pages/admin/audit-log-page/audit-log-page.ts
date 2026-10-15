import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideHistory, LucideSearch, LucideX } from '@lucide/angular';
import { Subject, Subscription, debounceTime } from 'rxjs';

import { AuditTimeline } from '../../../components/audit-timeline/audit-timeline';
import { InfiniteScroll } from '../../../components/infinite-scroll.directive';
import { FilterBar } from '../../../components/filter-bar/filter-bar';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import {
  AUDIT_ACTIONS,
  AUDIT_OBJECT_TYPES,
  AuditAction,
  AuditLog,
  AuditObjectType,
  AuditService,
} from '../../../service/audit.service';

const PAGE_SIZE = 50;

/** Everything that happened, newest first, with filters (admins only). */
@Component({
  selector: 'app-audit-log-page',
  imports: [AuditTimeline, FilterBar, InfiniteScroll, FormsModule, SearchSelect, LucideHistory, LucideSearch, LucideX],
  templateUrl: './audit-log-page.html',
  styleUrl: './audit-log-page.scss',
})
export class AuditLogPage implements OnInit, OnDestroy {
  protected entries: AuditLog[] = [];
  protected total = 0;
  protected loading = false;
  protected error = '';

  protected search = '';
  protected objectType: AuditObjectType | null = null;
  protected action: AuditAction | null = null;
  protected from = '';
  protected to = '';

  protected readonly typeOptions: SelectOption[] = AUDIT_OBJECT_TYPES.map((type) => ({ value: type.value, label: type.label }));
  protected readonly actionOptions: SelectOption[] = AUDIT_ACTIONS.map((action) => ({ value: action.value, label: action.label }));

  private page = 0;
  private readonly searchChanges = new Subject<void>();
  private searchSubscription?: Subscription;
  /** Answers of older requests are dropped when the filter changed in the meantime. */
  private requestId = 0;

  constructor(private readonly audit: AuditService) {}

  ngOnInit(): void {
    this.searchSubscription = this.searchChanges.pipe(debounceTime(300)).subscribe(() => this.reload());
    this.reload();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
  }

  protected get activeFilterCount(): number {
    return [this.objectType, this.action, this.from, this.to].filter(Boolean).length;
  }

  protected get hasActiveFilters(): boolean {
    return !!this.search.trim() || this.activeFilterCount > 0;
  }

  protected onSearch(): void {
    this.searchChanges.next();
  }

  protected resetFilters(): void {
    this.search = '';
    this.objectType = null;
    this.action = null;
    this.from = '';
    this.to = '';
    this.reload();
  }

  protected reload(): void {
    this.page = 0;
    this.entries = [];
    this.load();
  }

  /** Next page while scrolling (only when the previous one has arrived). */
  protected loadMore(): void {
    if (this.loading || this.error || this.entries.length >= this.total) {
      return;
    }
    this.page++;
    this.load();
  }

  private load(): void {
    const id = ++this.requestId;
    this.loading = true;
    this.error = '';
    this.audit
      .list({ search: this.search, objectType: this.objectType, action: this.action, from: this.from || null, to: this.to || null }, this.page, PAGE_SIZE)
      .subscribe({
        next: (result) => {
          if (id !== this.requestId) {
            return;
          }
          this.entries = [...this.entries, ...result.items];
          this.total = result.total;
          this.loading = false;
        },
        error: () => {
          if (id !== this.requestId) {
            return;
          }
          this.error = 'Protokoll konnte nicht geladen werden.';
          this.loading = false;
        },
      });
  }
}
