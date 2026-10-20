import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideClipboardCheck, LucideHistory } from '@lucide/angular';
import { catchError, of } from 'rxjs';

import { AssetInspectionList } from '../../../../shared/components/asset-inspection-list/asset-inspection-list';
import { AuditHistory } from '../../../../shared/components/audit-history/audit-history';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import {
  AssetInspection,
  InspectionService,
} from '../../../inspections/data-access/inspection.service';
import {
  InventoryApiService,
  InventoryItem,
} from '../../../inventory/data-access/inventory-api.service';

type Endpoint = 'assets' | 'locations';
type View = 'history' | 'inspections';

/**
 * Full history or all inspections of one asset / location (the detail page shows only the newest).
 * Route data: {@code endpoint} and {@code view}.
 */
@Component({
  selector: 'app-object-log-page',
  imports: [
    RouterLink,
    AssetInspectionList,
    AuditHistory,
    LucideArrowLeft,
    LucideClipboardCheck,
    LucideHistory,
    TranslatePipe,
  ],
  template: `
    <section class="page">
      <div class="page-shell">
        <a class="back-link" [routerLink]="['/', endpoint, uuid]">
          <svg lucideArrowLeft size="16"></svg>
          <span>{{ 'objectLog.backTo' | t: { name: name || objectLabel } }}</span>
        </a>
        <header class="page-header">
          <div>
            <p class="eyebrow">{{ objectLabel }} · {{ name }}</p>
            <h1>
              @if (view === 'history') {
                <svg lucideHistory size="20"></svg>
                <span>{{ 'common.history' | t }}</span>
              } @else {
                <svg lucideClipboardCheck size="20"></svg>
                <span>{{ 'terms.inspections' | t }}</span>
              }
            </h1>
          </div>
        </header>

        @if (view === 'history') {
          <app-audit-history [endpoint]="endpoint" [uuid]="uuid" />
        } @else {
          <section class="card">
            @if (loading) {
              <p class="hint">{{ 'objectLog.loadingInspections' | t }}</p>
            } @else if (error) {
              <p class="hint">{{ error }}</p>
            } @else if (!inspections.length) {
              <p class="hint">{{ 'objectLog.noInspections' | t }}</p>
            } @else {
              <app-asset-inspection-list [entries]="inspections" />
            }
          </section>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .page-shell {
      width: min(100%, 52rem);
    }
  `,
})
export class ObjectLogPage implements OnInit {
  protected endpoint: Endpoint = 'assets';
  protected view: View = 'history';
  protected uuid = '';
  protected name = '';
  protected inspections: AssetInspection[] = [];
  protected loading = false;
  protected error = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: InventoryApiService,
    private readonly inspectionService: InspectionService,
  ) {}

  protected get objectLabel(): string {
    return this.endpoint === 'assets' ? t('terms.asset') : t('terms.location');
  }

  ngOnInit(): void {
    this.endpoint = this.route.snapshot.data['endpoint'] ?? 'assets';
    this.view = this.route.snapshot.data['view'] ?? 'history';
    this.route.paramMap.subscribe((params) => {
      this.uuid = params.get('uuid') ?? '';
      this.load();
    });
  }

  private load(): void {
    this.api
      .get<InventoryItem>(this.endpoint, this.uuid)
      .pipe(catchError(() => of(null)))
      .subscribe((item) => (this.name = item?.name ?? ''));

    if (this.view === 'inspections') {
      this.loading = true;
      this.error = '';
      this.inspectionService.inspectionsOfAsset(this.uuid).subscribe({
        next: (inspections) => {
          this.inspections = inspections;
          this.loading = false;
        },
        error: () => {
          this.error = t('objectLog.errors.loadInspections');
          this.loading = false;
        },
      });
    }
  }
}
