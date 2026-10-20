import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideHistory, LucideRefreshCw } from '@lucide/angular';

import { t } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AssetStatusBadge } from '../asset-status-badge/asset-status-badge';
import {
  AssetStatus,
  AssetStatusService,
  isRetired,
  statusFitsAreas,
} from '../data-access/asset-status.service';

/** The parts of an asset this card needs. */
export interface StatusOwner {
  uuid: string;
  status?: AssetStatus | null;
  statusChangedAt?: string | null;
  areaUuids?: string[];
}

/**
 * Current status of an asset on its detail page. Users who may edit or inspect the asset change
 * the status here directly, with a comment; the history has its own page.
 */
@Component({
  selector: 'app-asset-status-card',
  imports: [
    AssetStatusBadge,
    DatePipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    LucideHistory,
    LucideRefreshCw,
  ],
  templateUrl: './asset-status-card.html',
  styleUrl: './asset-status-card.scss',
})
export class AssetStatusCard implements OnChanges {
  @Input({ required: true }) asset!: StatusOwner;
  @Input() canChange = false;
  /** The updated asset after a change. */
  @Output() changed = new EventEmitter<StatusOwner>();

  protected editing = false;
  protected options: AssetStatus[] = [];
  protected selected: string | null = null;
  protected comment = '';
  protected saving = false;
  protected error = '';

  constructor(
    private readonly statuses: AssetStatusService,
    private readonly destroyRef: DestroyRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    const previous = changes['asset']?.previousValue as StatusOwner | undefined;
    if (previous && previous.uuid !== this.asset.uuid) {
      this.editing = false;
    }
  }

  protected get retired(): boolean {
    return isRetired(this.asset.status);
  }

  protected startEdit(): void {
    this.editing = true;
    this.selected = this.asset.status?.uuid ?? null;
    this.comment = '';
    this.error = '';
    this.statuses
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (statuses) => {
          this.options = statuses.filter((status) => statusFitsAreas(status, this.asset.areaUuids));
        },
        error: () => (this.error = t('assetStatus.loadError')),
      });
  }

  protected cancel(): void {
    this.editing = false;
  }

  protected save(): void {
    if (!this.selected || this.selected === this.asset.status?.uuid || this.saving) {
      return;
    }
    this.saving = true;
    this.error = '';
    this.statuses
      .change<StatusOwner>(this.asset.uuid, this.selected, this.comment.trim() || null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (asset) => {
          this.saving = false;
          this.editing = false;
          this.changed.emit(asset);
        },
        error: (error) => {
          this.saving = false;
          this.error = error?.error?.message || t('assetStatus.saveError');
        },
      });
  }
}
