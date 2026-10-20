import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucidePlus, LucideShield, LucideTrash2, LucideX } from '@lucide/angular';
import { forkJoin } from 'rxjs';

import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { FilterBar } from '../../../../shared/components/filter-bar/filter-bar';
import {
  SearchSelect,
  SelectOption,
} from '../../../../shared/components/search-select/search-select';
import { PermissionResourceType } from '../../../../core/entities/user.entity';
import {
  AdminApiService,
  AdminGroup,
  AdminPermission,
  AdminPermissionRequest,
  PERMISSION_FLAGS,
  PERMISSION_PRESETS,
  PermissionFlag,
  RESOURCE_TYPE_LABELS,
  applyPreset,
  resourceTypeLabel,
} from '../../data-access/admin-api.service';
import { AreaItem } from '../../../../core/service/area.service';
import { t } from '../../../../core/i18n/i18n';
import { TranslateCountPipe, TranslatePipe } from '../../../../core/i18n/translate.pipe';

interface PermissionRow {
  group: AdminGroup;
  permission: AdminPermission;
}

/** Select value for "all areas" / "all kinds" (a real uuid or type is never this). */
const ALL = '__all__';

@Component({
  selector: 'app-permissions-page',
  imports: [
    TranslatePipe,
    TranslateCountPipe,
    FormsModule,
    FilterBar,
    RouterLink,
    SearchSelect,
    LucidePlus,
    LucideShield,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './permissions-page.html',
  styleUrl: './permissions-page.scss',
})
export class PermissionsPage implements OnInit {
  protected readonly flags = PERMISSION_FLAGS;
  protected readonly presetOptions: SelectOption[] = PERMISSION_PRESETS.map(({ key, label }) => ({
    value: key,
    label,
  }));
  protected readonly typeLabel = resourceTypeLabel;
  protected readonly typeOptions: SelectOption[] = [
    { value: ALL, label: t('adminPermissions.allObjectTypes') },
    ...Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  ];
  protected groups: AdminGroup[] = [];
  protected areas: AreaItem[] = [];
  protected loading = false;
  protected error = '';
  protected savingUuids = new Set<string>();
  protected groupFilter: string | null = null;
  protected typeFilter: string | null = null;
  protected areaFilter: string | null = null;

  protected showAddForm = false;
  protected newGroupUuid: string | null = null;
  protected newType: string = ALL;
  protected newAreaUuid: string | null = null;
  protected newPreset = 'read';

  constructor(
    private readonly api: AdminApiService,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  protected get groupOptions(): SelectOption[] {
    return this.groups.map((group) => ({ value: group.uuid, label: group.name }));
  }

  protected get areaOptions(): SelectOption[] {
    return this.areas.map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
  }

  protected get areaFilterOptions(): SelectOption[] {
    return [{ value: ALL, label: t('adminPermissions.appliesToAllAreas') }, ...this.areaOptions];
  }

  protected get rows(): PermissionRow[] {
    return this.groups
      .filter((group) => !this.groupFilter || group.uuid === this.groupFilter)
      .flatMap((group) => group.permissions.map((permission) => ({ group, permission })))
      .filter((row) => !this.typeFilter || (row.permission.resourceType ?? ALL) === this.typeFilter)
      .filter((row) => !this.areaFilter || (row.permission.areaUuid ?? ALL) === this.areaFilter)
      .sort(
        (a, b) =>
          a.group.name.localeCompare(b.group.name) ||
          this.areaName(a.permission.areaUuid).localeCompare(
            this.areaName(b.permission.areaUuid),
          ) ||
          (a.permission.resourceType ?? '').localeCompare(b.permission.resourceType ?? ''),
      );
  }

  protected get activeFilterCount(): number {
    return [this.groupFilter, this.typeFilter, this.areaFilter].filter(Boolean).length;
  }

  protected get hasActiveFilters(): boolean {
    return !!this.groupFilter || !!this.typeFilter || !!this.areaFilter;
  }

  protected areaName(areaUuid: string | null): string {
    if (!areaUuid) {
      return t('adminPermissions.allAreas');
    }
    return (
      this.areas.find((area) => area.uuid === areaUuid)?.name ?? t('adminPermissions.unknownArea')
    );
  }

  protected areaColor(areaUuid: string | null): string | null {
    return this.areas.find((area) => area.uuid === areaUuid)?.color ?? null;
  }

  protected resetFilters(): void {
    this.groupFilter = null;
    this.typeFilter = null;
    this.areaFilter = null;
  }

  protected toggle(row: PermissionRow, flag: PermissionFlag, value: boolean): void {
    const previous = row.permission[flag];
    row.permission[flag] = value;
    this.persist(row, () => (row.permission[flag] = previous));
  }

  protected applyPreset(row: PermissionRow, presetKey: string | null): void {
    if (!presetKey) {
      return;
    }
    const previous = { ...row.permission };
    applyPreset(row.permission, presetKey);
    this.persist(row, () => Object.assign(row.permission, previous));
  }

  protected async remove(row: PermissionRow): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: t('adminPermissions.removeConfirm.title'),
      message: t('adminPermissions.removeConfirm.message', {
        group: row.group.name,
        type: this.typeLabel(row.permission.resourceType),
        area: this.areaName(row.permission.areaUuid),
      }),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.deletePermission(row.permission.uuid).subscribe({
      next: () =>
        (row.group.permissions = row.group.permissions.filter((entry) => entry !== row.permission)),
      error: () => {
        this.error = t('adminPermissions.errors.remove');
      },
    });
  }

  protected openAddForm(): void {
    this.showAddForm = true;
    this.newGroupUuid = this.groupFilter;
    this.newType = this.typeFilter ?? ALL;
    this.newAreaUuid = this.areaFilter && this.areaFilter !== ALL ? this.areaFilter : null;
    this.newPreset = 'read';
  }

  protected changeNewType(type: string | null): void {
    this.newType = type ?? ALL;
  }

  private get newResourceType(): PermissionResourceType | null {
    return this.newType === ALL ? null : (this.newType as PermissionResourceType);
  }

  protected get newPermissionExists(): boolean {
    const group = this.groups.find((entry) => entry.uuid === this.newGroupUuid);
    return !!group?.permissions.some(
      (permission) =>
        permission.resourceType === this.newResourceType &&
        (permission.areaUuid ?? null) === this.newAreaUuid,
    );
  }

  protected addPermission(): void {
    const group = this.groups.find((entry) => entry.uuid === this.newGroupUuid);
    if (!group || this.newPermissionExists) {
      return;
    }
    const request: AdminPermissionRequest = {
      resourceType: this.newResourceType,
      areaUuid: this.newAreaUuid,
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canInspect: false,
      admin: false,
    };
    applyPreset(request, this.newPreset);
    this.api.createPermission(group.uuid, request).subscribe({
      next: () => {
        this.showAddForm = false;
        this.load();
      },
      error: () => {
        this.error = t('adminPermissions.errors.add');
      },
    });
  }

  private persist(row: PermissionRow, rollback: () => void): void {
    const { uuid, ...request } = row.permission;
    this.savingUuids.add(uuid);
    this.api.updatePermission(uuid, request).subscribe({
      next: () => this.savingUuids.delete(uuid),
      error: () => {
        rollback();
        this.savingUuids.delete(uuid);
        this.error = t('adminPermissions.errors.update');
      },
    });
  }

  private load(): void {
    this.loading = true;
    this.error = '';
    forkJoin({ groups: this.api.groups(), areas: this.api.areas() }).subscribe({
      next: ({ groups, areas }) => {
        this.groups = groups.sort((a, b) => a.name.localeCompare(b.name));
        this.areas = areas;
        this.loading = false;
      },
      error: () => {
        this.error = t('adminPermissions.errors.load');
        this.loading = false;
      },
    });
  }
}
