import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideCircleDot,
  LucideClipboardCheck,
} from '@lucide/angular';
import { catchError, forkJoin, of, switchMap } from 'rxjs';

import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import {
  InventoryApiService,
  InventoryItem,
} from '../../../inventory/data-access/inventory-api.service';
import { AssetStatusBadge } from '../../asset-status-badge/asset-status-badge';
import { AssetStatusChange, AssetStatusService } from '../../data-access/asset-status.service';

/** All status changes of one asset, newest first, with comment, author and the inspection that set them. */
@Component({
  selector: 'app-asset-status-history-page',
  imports: [
    AssetStatusBadge,
    DatePipe,
    RouterLink,
    TranslatePipe,
    LucideArrowLeft,
    LucideArrowRight,
    LucideCircleDot,
    LucideClipboardCheck,
  ],
  templateUrl: './asset-status-history-page.html',
  styleUrl: './asset-status-history-page.scss',
})
export class AssetStatusHistoryPage implements OnInit {
  protected uuid = '';
  protected asset: InventoryItem | null = null;
  protected history: AssetStatusChange[] = [];
  protected loading = true;
  protected error = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: InventoryApiService,
    private readonly statuses: AssetStatusService,
    private readonly destroyRef: DestroyRef,
  ) {}

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.uuid = params.get('uuid') ?? '';
          this.loading = true;
          this.error = '';
          return forkJoin({
            asset: this.api.get<InventoryItem>('assets', this.uuid).pipe(catchError(() => of(null))),
            history: this.statuses.history(this.uuid),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ asset, history }) => {
          this.asset = asset;
          this.history = history;
          this.loading = false;
        },
        error: () => {
          this.error = t('assetStatus.historyPage.loadError');
          this.loading = false;
        },
      });
  }
}
