import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideCircleDot, LucideLock, LucidePlus, LucideTrash2 } from '@lucide/angular';

import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AreaService } from '../../../../core/service/area.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { ColorPicker } from '../../../../shared/components/color-picker/color-picker';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  SearchSelect,
  SelectOption,
} from '../../../../shared/components/search-select/search-select';
import { AssetStatusBadge } from '../../asset-status-badge/asset-status-badge';
import {
  AssetStatus,
  AssetStatusCategory,
  AssetStatusRequest,
  AssetStatusService,
  STATUS_CATEGORIES,
  inAreaSelection,
  statusName,
} from '../../data-access/asset-status.service';

/**
 * The built-in statuses (fixed) and the custom statuses per area. Custom ones are maintained by
 * whoever may maintain the configuration (types) of their area.
 */
@Component({
  selector: 'app-asset-statuses-page',
  imports: [
    AssetStatusBadge,
    ColorPicker,
    FormsModule,
    SearchSelect,
    TranslatePipe,
    LucideCircleDot,
    LucideLock,
    LucidePlus,
    LucideTrash2,
  ],
  templateUrl: './asset-statuses-page.html',
  styleUrl: './asset-statuses-page.scss',
})
export class AssetStatusesPage implements OnInit {
  protected readonly categories = STATUS_CATEGORIES;
  protected readonly categoryOptions: SelectOption[] = STATUS_CATEGORIES.map((category) => ({
    value: category.value,
    label: category.label,
  }));
  protected statuses: AssetStatus[] = [];
  protected loaded = false;
  protected error = '';
  protected newName = '';
  protected newColor: string | null = '#2563eb';
  protected newCategory: AssetStatusCategory = 'ACTIVE';
  protected newArea: string | null = null;
  protected creating = false;
  /** uuid of the status that is being saved */
  protected saving: string | null = null;

  constructor(
    private readonly api: AssetStatusService,
    protected readonly areaService: AreaService,
    private readonly permissions: PermissionService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly destroyRef: DestroyRef,
  ) {}

  ngOnInit(): void {
    this.areaService
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.pickNewArea());
    // another sidebar selection: the new status goes to an area of it
    this.areaService.selected$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.pickNewArea());
    this.load();
  }

  protected get builtIn(): AssetStatus[] {
    return this.statuses.filter((status) => status.systemKey);
  }

  /** Only the statuses of the areas selected in the sidebar (the server sends only permitted ones). */
  protected get custom(): AssetStatus[] {
    const selected = this.areaService.selected;
    return this.statuses.filter((status) => !status.systemKey && inAreaSelection(status, selected));
  }

  /** Areas in which the user may add statuses, within the sidebar selection. */
  protected get createAreas() {
    const selected = this.areaService.selected;
    return this.areaService.areas.filter(
      (area) =>
        (!selected.length || selected.includes(area.uuid)) &&
        this.permissions.canInArea('ASSET_TYPE', 'create', area.uuid),
    );
  }

  protected get areaOptions(): SelectOption[] {
    return this.createAreas.map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
  }

  protected canEdit(status: AssetStatus): boolean {
    return !!status.areaUuid && this.permissions.canInArea('ASSET_TYPE', 'edit', status.areaUuid);
  }

  protected canDelete(status: AssetStatus): boolean {
    return !!status.areaUuid && this.permissions.canInArea('ASSET_TYPE', 'delete', status.areaUuid);
  }

  protected areaName(uuid: string | null): string {
    return uuid ? this.areaService.name(uuid) : '';
  }

  protected categoryLabel(category: AssetStatusCategory): string {
    return this.categories.find((entry) => entry.value === category)?.label ?? category;
  }

  protected create(): void {
    const name = this.newName.trim();
    if (!name || this.creating) {
      return;
    }
    this.creating = true;
    this.error = '';
    const request: AssetStatusRequest = {
      name,
      color: this.newColor,
      category: this.newCategory,
      areaUuid: this.newArea,
    };
    this.api
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creating = false;
          this.newName = '';
          this.load();
        },
        error: (error) => {
          this.creating = false;
          this.error = error?.error?.message || t('assetStatus.config.saveError');
        },
      });
  }

  /** Name, color and behavior save right away (name on leaving the field). */
  protected save(status: AssetStatus, change: Partial<AssetStatusRequest>): void {
    const request: AssetStatusRequest = {
      name: status.name,
      color: status.color,
      category: status.category,
      areaUuid: status.areaUuid,
      ...change,
    };
    if (!request.name.trim()) {
      return;
    }
    this.saving = status.uuid;
    this.error = '';
    this.api
      .update(status.uuid, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving = null;
          this.statuses = this.statuses.map((entry) => (entry.uuid === saved.uuid ? saved : entry));
        },
        error: (error) => {
          this.saving = null;
          this.error = error?.error?.message || t('assetStatus.config.saveError');
          this.load();
        },
      });
  }

  protected rename(status: AssetStatus, name: string): void {
    if (name.trim() && name.trim() !== status.name) {
      this.save(status, { name: name.trim() });
    }
  }

  protected async remove(status: AssetStatus): Promise<void> {
    if (!(await this.confirmDialog.confirmDelete(statusName(status)))) {
      return;
    }
    this.error = '';
    this.api
      .delete(status.uuid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => (this.statuses = this.statuses.filter((entry) => entry.uuid !== status.uuid)),
        error: (error) => (this.error = error?.error?.message || t('assetStatus.config.deleteError')),
      });
  }

  private pickNewArea(): void {
    if (!this.createAreas.some((area) => area.uuid === this.newArea)) {
      this.newArea = this.createAreas[0]?.uuid ?? null;
    }
  }

  private load(): void {
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (statuses) => {
          this.statuses = statuses;
          this.loaded = true;
        },
        error: () => {
          this.loaded = true;
          this.error = t('assetStatus.loadError');
        },
      });
  }
}
