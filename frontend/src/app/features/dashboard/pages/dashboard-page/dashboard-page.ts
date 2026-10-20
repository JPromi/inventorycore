import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideBoxes,
  LucideCalendarClock,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideCircleX,
  LucideMapPin,
  LucideShapes,
  LucideTags,
  LucideTriangleAlert,
  LucideWrench,
} from '@lucide/angular';
import { Subscription, catchError, map, of, switchMap, tap } from 'rxjs';

import { t, tn } from '../../../../core/i18n/i18n';
import { TranslateCountPipe, TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AreaService } from '../../../../core/service/area.service';
import { InspectionDue, InspectionSummary, dueText } from '../../../inspections/data-access/inspection.service';
import { Dashboard, DashboardCount, DashboardService } from '../../data-access/dashboard.service';

/** One part of the result bar: share of all checked assets, with its own icon and label. */
interface ResultPart {
  key: 'ok' | 'defect' | 'problem';
  count: number;
  percent: number;
  label: string;
}

/**
 * Start page: inventory numbers, upcoming and recent inspections, tags and a few statistics, always
 * for the areas chosen in the sidebar. All numbers come from `/api/dashboard` (counted on the server).
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    RouterLink,
    TranslatePipe,
    TranslateCountPipe,
    LucideBoxes,
    LucideCalendarClock,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideCircleX,
    LucideMapPin,
    LucideShapes,
    LucideTags,
    LucideTriangleAlert,
    LucideWrench,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements OnInit, OnDestroy {
  protected dashboard: Dashboard | null = null;
  protected loading = true;
  protected error = '';

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly api: DashboardService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    // every change of the sidebar areas reloads; a slower older answer is dropped
    this.subscriptions.add(
      this.areaService.selected$
        .pipe(
          tap(() => {
            this.loading = true;
            this.error = '';
          }),
          switchMap((areas) =>
            this.api.dashboard(areas).pipe(
              map((dashboard): Dashboard | null => dashboard),
              catchError(() => {
                this.error = t('common.errors.load');
                return of(null);
              }),
            ),
          ),
        )
        .subscribe((dashboard) => {
          this.loading = false;
          if (dashboard) {
            this.dashboard = dashboard;
          }
        }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get filtered(): boolean {
    return this.areaService.selected.length > 0;
  }

  protected dueText(entry: InspectionDue): string {
    return dueText(entry.daysUntilDue);
  }

  /** e.g. "12 von 14 vorhanden" (inventory) or "8 von 9 in Ordnung" (single checks). */
  protected inspectionResult(inspection: InspectionSummary): string {
    const counts = inspection.counts;
    return inspection.mode === 'CHECK'
      ? t('dashboard.recent.passedOf', { count: counts.passed, total: counts.expected })
      : t('dashboard.recent.presentOf', { count: counts.present, total: counts.expected });
  }

  /** Problems of a completed inspection, for the warning next to it. */
  protected inspectionProblems(inspection: InspectionSummary): number {
    const counts = inspection.counts;
    return counts.missing + counts.failed + counts.defect;
  }

  protected typeName(entry: DashboardCount): string {
    return entry.name ?? t('dashboard.stats.withoutType');
  }

  /** Bar length relative to the largest type, so the longest bar fills the row. */
  protected typeShare(entry: DashboardCount): number {
    const max = Math.max(...(this.dashboard?.assetsByType.map((type) => type.count) ?? [0]));
    return max > 0 ? (entry.count / max) * 100 : 0;
  }

  protected get resultTotal(): number {
    const results = this.dashboard?.results;
    return results ? results.ok + results.defect + results.missing + results.failed : 0;
  }

  /** Parts of the result bar; missing (inventory) and failed (single checks) are both problems. */
  protected get resultParts(): ResultPart[] {
    const results = this.dashboard?.results;
    const total = this.resultTotal;
    if (!results || !total) {
      return [];
    }
    const parts: Omit<ResultPart, 'percent'>[] = [
      { key: 'ok', count: results.ok, label: t('dashboard.results.ok') },
      { key: 'defect', count: results.defect, label: t('dashboard.results.defect') },
      { key: 'problem', count: results.missing + results.failed, label: t('dashboard.results.problem') },
    ];
    return parts.map((part) => ({ ...part, percent: (part.count / total) * 100 }));
  }

  /** Share of the checked assets without any problem, the headline of the result card. */
  protected get okShare(): number {
    const total = this.resultTotal;
    return total ? Math.round(((this.dashboard?.results.ok ?? 0) / total) * 100) : 0;
  }

  protected resultTitle(part: ResultPart): string {
    return t('dashboard.results.partTitle', { label: part.label, count: part.count, percent: Math.round(part.percent) });
  }

  protected assetsLabel(count: number): string {
    return tn('dashboard.stats.assets', count);
  }
}
