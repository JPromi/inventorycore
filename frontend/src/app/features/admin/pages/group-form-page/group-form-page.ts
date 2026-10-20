import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucidePlus,
  LucideSave,
  LucideTrash2,
  LucideUsers,
} from '@lucide/angular';
import { Observable, concat, forkJoin, last, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MultiSelect } from '../../../../shared/components/multi-select/multi-select';
import {
  SearchSelect,
  SelectOption,
} from '../../../../shared/components/search-select/search-select';
import { PermissionResourceType } from '../../../../core/entities/user.entity';
import {
  AdminApiService,
  AdminGroupRequest,
  AdminPermissionRequest,
  AdminUser,
  PERMISSION_FLAGS,
  PERMISSION_PRESETS,
  RESOURCE_TYPE_LABELS,
  applyPreset,
} from '../../data-access/admin-api.service';
import { AreaItem } from '../../../../core/service/area.service';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-group-form-page',
  imports: [
    TranslatePipe,
    FormsModule,
    RouterLink,
    MultiSelect,
    SearchSelect,
    LucideArrowLeft,
    LucidePlus,
    LucideSave,
    LucideTrash2,
    LucideUsers,
  ],
  templateUrl: './group-form-page.html',
  styleUrl: './group-form-page.scss',
})
export class GroupFormPage implements OnInit {
  protected readonly flags = PERMISSION_FLAGS;
  protected readonly presetOptions: SelectOption[] = PERMISSION_PRESETS.map(({ key, label }) => ({
    value: key,
    label,
  }));
  protected readonly resourceTypes = Object.entries(RESOURCE_TYPE_LABELS) as [
    PermissionResourceType,
    string,
  ][];
  protected uuid: string | null = null;
  protected name = '';
  protected readOnlyName = false;
  protected adminGroup = false;
  protected sourceProvider: string = 'LOCAL';
  protected permissions: AdminPermissionRequest[] = [];
  protected memberUuids: string[] = [];
  protected users: AdminUser[] = [];
  protected areas: AreaItem[] = [];
  protected quickAreaUuid: string | null = null;
  protected quickPreset = 'read';
  protected loading = false;
  protected saving = false;
  protected error = '';
  private originalMemberUuids: string[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: AdminApiService,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    this.load();
  }

  protected get title(): string {
    return this.uuid ? t('adminGroupForm.titleEdit') : t('adminGroupForm.titleCreate');
  }

  protected get userOptions(): SelectOption[] {
    return this.users
      .map((user) => ({
        value: user.uuid,
        label: user.displayName || user.username,
        hint: user.username,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get areaOptions(): SelectOption[] {
    return this.areas.map((area) => ({
      value: area.uuid,
      label: area.name,
      color: area.color,
      hint: area.defaultArea ? t('adminGroupForm.defaultArea') : undefined,
    }));
  }

  /** Grants the chosen rights for all object kinds of one area in one step. */
  protected grantArea(): void {
    if (!this.quickAreaUuid) {
      return;
    }
    let permission = this.permissions.find(
      (entry) => entry.resourceType === null && entry.areaUuid === this.quickAreaUuid,
    );
    if (!permission) {
      permission = this.emptyPermission(null, this.quickAreaUuid);
      this.permissions = [...this.permissions, permission];
    }
    applyPreset(permission, this.quickPreset);
    this.quickAreaUuid = null;
  }

  protected addPermission(): void {
    const defaultArea = this.areas.find((area) => area.defaultArea)?.uuid ?? null;
    this.permissions = [...this.permissions, this.emptyPermission(null, defaultArea)];
  }

  private emptyPermission(
    type: PermissionResourceType | null,
    areaUuid: string | null,
  ): AdminPermissionRequest {
    const permission: AdminPermissionRequest = {
      resourceType: type,
      areaUuid,
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canInspect: false,
      admin: false,
    };
    applyPreset(permission, 'read');
    return permission;
  }

  protected removePermission(index: number): void {
    this.permissions = this.permissions.filter((_, entryIndex) => entryIndex !== index);
  }

  protected applyPreset(permission: AdminPermissionRequest, presetKey: string | null): void {
    if (!presetKey) {
      return;
    }
    applyPreset(permission, presetKey);
  }

  protected isDuplicate(index: number): boolean {
    const current = this.permissions[index];
    return this.permissions.some(
      (other, otherIndex) =>
        otherIndex < index &&
        other.resourceType === current.resourceType &&
        (other.areaUuid ?? null) === (current.areaUuid ?? null),
    );
  }

  protected save(): void {
    if (this.saving) {
      return;
    }
    if (!this.name.trim()) {
      this.error = t('adminGroupForm.errors.nameRequired');
      return;
    }
    if (this.permissions.some((_, index) => this.isDuplicate(index))) {
      this.error = t('adminGroupForm.errors.duplicate');
      return;
    }

    const request: AdminGroupRequest = {
      name: this.name.trim(),
      permissions: this.permissions,
      adminGroup: this.adminGroup,
    };
    this.saving = true;
    this.error = '';
    const save$ = this.uuid
      ? this.api.updateGroup(this.uuid, request)
      : this.api.createGroup(request);
    save$
      .pipe(
        switchMap((group) => {
          this.uuid = group.uuid;
          return this.saveMembers(group.uuid);
        }),
      )
      .subscribe({
        next: () => this.router.navigate(['/admin/groups']),
        error: () => {
          this.saving = false;
          this.error = t('common.errors.save');
        },
      });
  }

  protected async remove(): Promise<void> {
    if (!this.uuid || !(await this.confirmDialog.confirmDelete(this.name))) {
      return;
    }
    this.api.deleteGroup(this.uuid).subscribe({
      next: () => this.router.navigate(['/admin/groups']),
      error: () => {
        this.error = t('adminGroupForm.errors.delete');
      },
    });
  }

  /** "All areas" first, then by area name. */
  private areaSortKey(areaUuid: string | null): string {
    return areaUuid ? `1${this.areas.find((area) => area.uuid === areaUuid)?.name ?? ''}` : '0';
  }

  /** Membership is stored on the user, so every added/removed member gets updated. */
  private saveMembers(groupUuid: string): Observable<unknown> {
    const before = new Set(this.originalMemberUuids);
    const after = new Set(this.memberUuids);
    const changed = this.users.filter((user) => before.has(user.uuid) !== after.has(user.uuid));
    if (!changed.length) {
      return of(null);
    }
    const updates = changed.map((user) => {
      const groupUuids = after.has(user.uuid)
        ? [...new Set([...user.groupUuids, groupUuid])]
        : user.groupUuids.filter((uuid) => uuid !== groupUuid);
      return this.api
        .updateUser(user.uuid, {
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          password: null,
          role: user.role,
          enabled: user.enabled,
          groupUuids,
        })
        .pipe(
          tap(() => {
            user.groupUuids = groupUuids;
            this.originalMemberUuids = after.has(user.uuid)
              ? [...new Set([...this.originalMemberUuids, user.uuid])]
              : this.originalMemberUuids.filter((uuid) => uuid !== user.uuid);
          }),
        );
    });
    return concat(...updates).pipe(last());
  }

  private load(): void {
    this.loading = true;
    forkJoin({
      groups: this.api.groups(),
      users: this.api.users(),
      areas: this.api.areas(),
    }).subscribe({
      next: ({ groups, users, areas }) => {
        this.users = users;
        this.areas = areas;
        if (this.uuid) {
          const group = groups.find((entry) => entry.uuid === this.uuid);
          if (!group) {
            this.error = t('adminGroupForm.errors.notFound');
          } else {
            this.name = group.name;
            this.readOnlyName = group.sourceProvider !== 'LOCAL';
            this.sourceProvider = group.sourceProvider;
            this.adminGroup = group.adminGroup;
            this.permissions = group.permissions
              .map(({ uuid: _uuid, ...permission }) => ({ ...permission }))
              .sort(
                (a, b) =>
                  this.areaSortKey(a.areaUuid).localeCompare(this.areaSortKey(b.areaUuid)) ||
                  (a.resourceType ?? '').localeCompare(b.resourceType ?? ''),
              );
            this.memberUuids = users
              .filter((user) => user.groupUuids.includes(group.uuid))
              .map((user) => user.uuid);
            this.originalMemberUuids = [...this.memberUuids];
          }
        }
        this.loading = false;
      },
      error: () => {
        this.error = t('common.errors.load');
        this.loading = false;
      },
    });
  }
}
