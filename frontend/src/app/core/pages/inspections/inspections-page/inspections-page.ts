import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LucideCalendarClock,
  LucideChevronDown,
  LucideClipboardCheck,
  LucidePlay,
  LucidePlus,
  LucideSearch,
  LucideTriangleAlert,
  LucideX,
} from '@lucide/angular';
import { Subject, Subscription, debounceTime, forkJoin, of, skip } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  InspectionDue,
  InspectionPage,
  InspectionService,
  InspectionStatus,
  InspectionSummary,
  dueText,
  intervalText,
} from '../../../service/inspection.service';
import { AreaService } from '../../../service/area.service';
import { PermissionService } from '../../../service/permission.service';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { InfiniteScroll } from '../../../components/infinite-scroll.directive';
import { PagedList, SEARCH_DELAY_MS } from '../../../util/paged-list';
import { t } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/translate.pipe';

type StatusFilter = InspectionStatus | 'ALL' | 'DUE';

/** Due entries of one recurring inspection type. */
interface DueGroup {
  typeUuid: string;
  typeName: string;
  color: string | null;
  interval: string;
  overdue: number;
  entries: InspectionDue[];
}

@Component({
  selector: 'app-inspections-page',
  imports: [
    DatePipe,
    InfiniteScroll,
    ListActions,
    SelectableRow,
    SelectionCheckbox,
    FormsModule,
    RouterLink,
    TranslatePipe,
    LucideCalendarClock,
    LucideChevronDown,
    LucideClipboardCheck,
    LucidePlay,
    LucidePlus,
    LucideSearch,
    LucideTriangleAlert,
    LucideX,
  ],
  templateUrl: './inspections-page.html',
  styleUrl: './inspections-page.scss',
})
export class InspectionsPage implements OnInit, OnDestroy {
  /** Like the backend: completed protocols only admins; open ones whoever started them or may delete assets there. */
  protected readonly canBulkDelete = (item: InspectionSummary) => this.permissions.isAdmin
    || (item.status === 'OPEN' && ((!!item.createdByUuid && item.createdByUuid === this.permissions.userUuid)
      || this.permissions.can('ASSET', 'delete', item.areaUuids)));
  protected readonly bulkDelete = (item: InspectionSummary) => this.api.delete(item.uuid);
  protected bulkDeleted(uuids: string[]): void {
    const open = this.list.items.filter((item) => uuids.includes(item.uuid) && item.status === 'OPEN').length;
    const removed = this.list.items.filter((item) => uuids.includes(item.uuid)).length;
    this.list.remove((item) => uuids.includes(item.uuid));
    this.openCount -= open;
    this.completedCount -= removed - open;
  }
  /** Protocols of the chosen tab, searched on the server and loaded page by page while scrolling. */
  protected readonly list = new PagedList<InspectionSummary, InspectionPage>((page, size) =>
    this.api.inspectionPage({ q: this.search, status: this.statusFilter === 'ALL' || this.statusFilter === 'DUE' ? null : this.statusFilter, areas: this.areaService.selected }, page, size));
  /** tab counts, from the server (within the sidebar areas, independent of the search) */
  protected openCount = 0;
  protected completedCount = 0;
  /** Recurring inspections that are overdue or due soon. */
  protected due: InspectionDue[] = [];
  protected expandedGroups = new Set<string>();
  protected readonly dueText = dueText;
  protected statusFilter: StatusFilter = 'OPEN';
  protected search = '';
  protected loading = false;
  protected error = '';
  private readonly searchChanges = new Subject<void>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly api: InspectionService,
    private readonly router: Router,
    protected readonly permissions: PermissionService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.subscriptions.add(this.areaService.selected$.pipe(skip(1)).subscribe(() => this.list.reload()));
    this.subscriptions.add(this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload()));
    // the counts come with every page
    this.subscriptions.add(this.list.loadedPages.subscribe((page) => this.setCounts(page)));
    forkJoin({
      // one entry is enough for the tab counts
      counts: this.api.inspectionPage({ areas: this.areaService.selected }, 0, 1),
      schedules: this.api.schedules().pipe(catchError(() => of([] as InspectionDue[]))),
    }).subscribe({
      next: ({ counts, schedules }) => {
        this.setCounts(counts);
        this.due = schedules.filter((entry) => entry.state !== 'OK');
        // overdue first, then open inspections, then everything
        if (this.overdueCount) {
          this.statusFilter = 'DUE';
        } else if (!counts.openCount) {
          this.statusFilter = this.due.length ? 'DUE' : 'ALL';
        }
        this.loading = false;
        this.list.reload();
      },
      error: () => {
        this.error = t('inspectionList.loadError');
        this.loading = false;
      },
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.list.destroy();
  }

  protected setStatus(status: StatusFilter): void {
    this.statusFilter = status;
    if (status !== 'DUE') {
      this.list.reload();
    }
  }

  protected onSearchChange(): void {
    this.searchChanges.next();
  }

  protected clearSearch(): void {
    this.search = '';
    this.list.reload();
  }

  private setCounts(page: InspectionPage): void {
    this.openCount = page.openCount;
    this.completedCount = page.completedCount;
  }

  /** Due entries of assets in the areas chosen in the sidebar. */
  protected get areaDue(): InspectionDue[] {
    return this.due.filter((entry) => this.areaService.overlapsSelection(entry.assetAreaUuids));
  }

  protected get canStart(): boolean {
    return this.permissions.can('ASSET', 'inspect');
  }

  protected count(status: StatusFilter): number {
    if (status === 'DUE') {
      return this.areaDue.length;
    }
    return status === 'ALL' ? this.openCount + this.completedCount : status === 'OPEN' ? this.openCount : this.completedCount;
  }

  protected get overdueCount(): number {
    return this.areaDue.filter((entry) => entry.state === 'OVERDUE').length;
  }

  /** Due entries grouped by inspection type, the type with the most overdue first. */
  protected get dueGroups(): DueGroup[] {
    const term = this.search.trim().toLowerCase();
    const groups = new Map<string, DueGroup>();
    for (const entry of this.areaDue) {
      if (term && ![entry.assetName, entry.invId, entry.locationName, entry.inspectionTypeName].some((value) => value?.toLowerCase().includes(term))) {
        continue;
      }
      let group = groups.get(entry.inspectionTypeUuid);
      if (!group) {
        group = {
          typeUuid: entry.inspectionTypeUuid,
          typeName: entry.inspectionTypeName,
          color: entry.inspectionTypeColor,
          interval: intervalText(entry.intervalValue, entry.intervalUnit),
          overdue: 0,
          entries: [],
        };
        groups.set(entry.inspectionTypeUuid, group);
      }
      group.entries.push(entry);
      if (entry.state === 'OVERDUE') {
        group.overdue++;
      }
    }
    return [...groups.values()].sort((a, b) => b.overdue - a.overdue || a.typeName.localeCompare(b.typeName));
  }

  protected isSet(value: string | null): boolean {
    return !!value;
  }

  protected toggleGroup(uuid: string): void {
    this.expandedGroups.has(uuid) ? this.expandedGroups.delete(uuid) : this.expandedGroups.add(uuid);
  }

  protected startDue(group: DueGroup, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/inspections/new'], { queryParams: { type: group.typeUuid, due: 1 } });
  }

  protected get visible(): InspectionSummary[] {
    return this.list.items;
  }

  /** Share of the assets that were checked. */
  protected progress(inspection: InspectionSummary): number {
    const { expected, pending } = inspection.counts;
    return expected ? Math.round(((expected - pending) / expected) * 100) : 100;
  }

  /** Present (inventory) or in order (single checks). */
  protected good(inspection: InspectionSummary): number {
    return inspection.mode === 'CHECK' ? inspection.counts.passed : inspection.counts.present;
  }

  protected bad(inspection: InspectionSummary): number {
    return inspection.mode === 'CHECK' ? inspection.counts.failed : inspection.counts.missing;
  }

  protected open(inspection: InspectionSummary): void {
    this.router.navigate(['/inspections', inspection.uuid]);
  }
}
