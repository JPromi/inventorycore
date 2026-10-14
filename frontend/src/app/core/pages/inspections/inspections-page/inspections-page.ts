import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  InspectionDue,
  InspectionService,
  InspectionStatus,
  InspectionSummary,
  dueText,
  intervalText,
} from '../../../service/inspection.service';
import { PermissionService } from '../../../service/permission.service';

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
    FormsModule,
    RouterLink,
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
export class InspectionsPage implements OnInit {
  protected inspections: InspectionSummary[] = [];
  /** Recurring inspections that are overdue or due soon. */
  protected due: InspectionDue[] = [];
  protected expandedGroups = new Set<string>();
  protected readonly dueText = dueText;
  protected statusFilter: StatusFilter = 'OPEN';
  protected search = '';
  protected loading = false;
  protected error = '';

  constructor(
    private readonly api: InspectionService,
    private readonly router: Router,
    protected readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    forkJoin({
      inspections: this.api.inspections(),
      schedules: this.api.schedules().pipe(catchError(() => of([] as InspectionDue[]))),
    }).subscribe({
      next: ({ inspections, schedules }) => {
        this.inspections = inspections;
        this.due = schedules.filter((entry) => entry.state !== 'OK');
        // overdue first, then open inspections, then everything
        if (this.overdueCount) {
          this.statusFilter = 'DUE';
        } else if (!inspections.some((inspection) => inspection.status === 'OPEN')) {
          this.statusFilter = this.due.length ? 'DUE' : 'ALL';
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Prüfungen konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  protected get canStart(): boolean {
    return this.permissions.can('ASSET', 'inspect');
  }

  protected count(status: StatusFilter): number {
    if (status === 'DUE') {
      return this.due.length;
    }
    return status === 'ALL' ? this.inspections.length : this.inspections.filter((inspection) => inspection.status === status).length;
  }

  protected get overdueCount(): number {
    return this.due.filter((entry) => entry.state === 'OVERDUE').length;
  }

  /** Due entries grouped by inspection type, the type with the most overdue first. */
  protected get dueGroups(): DueGroup[] {
    const term = this.search.trim().toLowerCase();
    const groups = new Map<string, DueGroup>();
    for (const entry of this.due) {
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
    const term = this.search.trim().toLowerCase();
    return this.inspections.filter(
      (inspection) =>
        (this.statusFilter === 'ALL' || inspection.status === this.statusFilter) &&
        (!term || [inspection.title, inspection.typeName, inspection.filterSummary, inspection.createdByName].some((value) => value?.toLowerCase().includes(term))),
    );
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
