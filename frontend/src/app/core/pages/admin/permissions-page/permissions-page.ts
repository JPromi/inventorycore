import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucidePlus, LucideShield, LucideTrash2, LucideX } from '@lucide/angular';
import { forkJoin } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import { PermissionResourceType } from '../../../entities/user.entity';
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
} from '../../../service/admin-api.service';
import { AreaItem } from '../../../service/area.service';

interface PermissionRow {
  group: AdminGroup;
  permission: AdminPermission;
}

/** Filter value for permissions that apply to all areas (a real area uuid is never this). */
const ALL_AREAS = '__all__';

@Component({
  selector: 'app-permissions-page',
  imports: [FormsModule, RouterLink, SearchSelect, LucidePlus, LucideShield, LucideTrash2, LucideX],
  templateUrl: './permissions-page.html',
  styleUrl: './permissions-page.scss',
})
export class PermissionsPage implements OnInit {
  protected readonly flags = PERMISSION_FLAGS;
  protected readonly presets = PERMISSION_PRESETS;
  protected readonly typeLabels = RESOURCE_TYPE_LABELS;
  protected readonly typeOptions: SelectOption[] = Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }));
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
  protected newType: PermissionResourceType = 'ASSET';
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
    return [{ value: ALL_AREAS, label: 'Gilt für alle Bereiche' }, ...this.areaOptions];
  }

  protected get rows(): PermissionRow[] {
    return this.groups
      .filter((group) => !this.groupFilter || group.uuid === this.groupFilter)
      .flatMap((group) => group.permissions.map((permission) => ({ group, permission })))
      .filter((row) => !this.typeFilter || row.permission.resourceType === this.typeFilter)
      .filter((row) => !this.areaFilter || (row.permission.areaUuid ?? ALL_AREAS) === this.areaFilter)
      .sort(
        (a, b) =>
          a.group.name.localeCompare(b.group.name) ||
          this.areaName(a.permission.areaUuid).localeCompare(this.areaName(b.permission.areaUuid)) ||
          a.permission.resourceType.localeCompare(b.permission.resourceType),
      );
  }

  protected get hasActiveFilters(): boolean {
    return !!this.groupFilter || !!this.typeFilter || !!this.areaFilter;
  }

  protected areaName(areaUuid: string | null): string {
    if (!areaUuid) {
      return 'Alle Bereiche';
    }
    return this.areas.find((area) => area.uuid === areaUuid)?.name ?? 'Unbekannter Bereich';
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

  protected applyPreset(row: PermissionRow, presetKey: string): void {
    const previous = { ...row.permission };
    applyPreset(row.permission, presetKey);
    this.persist(row, () => Object.assign(row.permission, previous));
  }

  protected async remove(row: PermissionRow): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Berechtigung entfernen?',
      message: `Gruppe „${row.group.name}“ verliert den Zugriff auf ${this.typeLabels[row.permission.resourceType]} in „${this.areaName(row.permission.areaUuid)}“.`,
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.deletePermission(row.permission.uuid).subscribe({
      next: () => (row.group.permissions = row.group.permissions.filter((entry) => entry !== row.permission)),
      error: () => {
        this.error = 'Berechtigung konnte nicht entfernt werden.';
      },
    });
  }

  protected openAddForm(): void {
    this.showAddForm = true;
    this.newGroupUuid = this.groupFilter;
    this.newType = (this.typeFilter as PermissionResourceType) ?? 'ASSET';
    this.newAreaUuid = this.areaFilter && this.areaFilter !== ALL_AREAS ? this.areaFilter : null;
    this.newPreset = 'read';
  }

  protected changeNewType(type: string | null): void {
    this.newType = (type as PermissionResourceType) ?? 'ASSET';
  }

  protected get newPermissionExists(): boolean {
    const group = this.groups.find((entry) => entry.uuid === this.newGroupUuid);
    return !!group?.permissions.some(
      (permission) => permission.resourceType === this.newType && (permission.areaUuid ?? null) === this.newAreaUuid,
    );
  }

  protected addPermission(): void {
    const group = this.groups.find((entry) => entry.uuid === this.newGroupUuid);
    if (!group || this.newPermissionExists) {
      return;
    }
    const request: AdminPermissionRequest = {
      resourceType: this.newType,
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
        this.error = 'Berechtigung konnte nicht hinzugefügt werden.';
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
        this.error = 'Änderung konnte nicht gespeichert werden.';
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
        this.error = 'Berechtigungen konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }
}
