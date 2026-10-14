import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideClipboardCheck, LucidePlus, LucideSearch, LucideTriangleAlert, LucideX } from '@lucide/angular';

import { InspectionService, InspectionStatus, InspectionSummary } from '../../../service/inspection.service';
import { PermissionService } from '../../../service/permission.service';

type StatusFilter = InspectionStatus | 'ALL';

@Component({
  selector: 'app-inspections-page',
  imports: [DatePipe, FormsModule, RouterLink, LucideClipboardCheck, LucidePlus, LucideSearch, LucideTriangleAlert, LucideX],
  templateUrl: './inspections-page.html',
  styleUrl: './inspections-page.scss',
})
export class InspectionsPage implements OnInit {
  protected inspections: InspectionSummary[] = [];
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
    this.api.inspections().subscribe({
      next: (inspections) => {
        this.inspections = inspections;
        // with nothing open, show the protocols right away
        if (!inspections.some((inspection) => inspection.status === 'OPEN')) {
          this.statusFilter = 'ALL';
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
    return status === 'ALL' ? this.inspections.length : this.inspections.filter((inspection) => inspection.status === status).length;
  }

  protected get visible(): InspectionSummary[] {
    const term = this.search.trim().toLowerCase();
    return this.inspections.filter(
      (inspection) =>
        (this.statusFilter === 'ALL' || inspection.status === this.statusFilter) &&
        (!term || [inspection.title, inspection.typeName, inspection.filterSummary, inspection.createdByName].some((value) => value?.toLowerCase().includes(term))),
    );
  }

  /** Share of expected assets that were checked (present or missing). */
  protected progress(inspection: InspectionSummary): number {
    const { expected, present, missing } = inspection.counts;
    return expected ? Math.round(((present + missing) / expected) * 100) : 100;
  }

  protected open(inspection: InspectionSummary): void {
    this.router.navigate(['/inspections', inspection.uuid]);
  }
}
