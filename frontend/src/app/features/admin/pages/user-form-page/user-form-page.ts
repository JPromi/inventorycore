import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideSave, LucideTrash2, LucideUser } from '@lucide/angular';
import { forkJoin } from 'rxjs';

import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MultiSelect } from '../../../../shared/components/multi-select/multi-select';
import { SelectOption } from '../../../../shared/components/search-select/search-select';
import {
  AdminApiService,
  AdminGroup,
  AdminUserRequest,
  AuthProvider,
  PROVIDER_LABELS,
} from '../../data-access/admin-api.service';
import { AuthStateService } from '../../../../core/service/auth-state.service';
import { t, tn } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { UserLogins } from '../../user-logins/user-logins';

@Component({
  selector: 'app-user-form-page',
  imports: [
    UserLogins,
    TranslatePipe,
    FormsModule,
    RouterLink,
    MultiSelect,
    LucideArrowLeft,
    LucideSave,
    LucideTrash2,
    LucideUser,
  ],
  templateUrl: './user-form-page.html',
  styleUrl: './user-form-page.scss',
})
export class UserFormPage implements OnInit {
  protected uuid: string | null = null;
  protected form: AdminUserRequest = this.emptyForm();
  protected groups: AdminGroup[] = [];
  protected loading = false;
  protected saving = false;
  protected error = '';
  protected isSelf = false;
  protected readonly providerLabels = PROVIDER_LABELS;
  protected sourceProvider: AuthProvider = 'LOCAL';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: AdminApiService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly authState: AuthStateService,
  ) {}

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    this.load();
  }

  protected get title(): string {
    return this.uuid ? t('adminUserForm.titleEdit') : t('adminUserForm.titleCreate');
  }

  protected get groupOptions(): SelectOption[] {
    return this.groups
      .map((group) => ({
        value: group.uuid,
        label: group.name,
        hint: tn('adminUserForm.groupPermissions', group.permissions.length),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get passwordRequired(): boolean {
    return !this.uuid;
  }

  protected save(): void {
    if (this.saving) {
      return;
    }
    if (!this.form.username.trim()) {
      this.error = t('adminUserForm.errors.usernameRequired');
      return;
    }
    if (this.passwordRequired && !this.form.password) {
      this.error = t('adminUserForm.errors.passwordRequired');
      return;
    }

    const request: AdminUserRequest = {
      ...this.form,
      username: this.form.username.trim(),
      displayName: this.form.displayName?.trim() || null,
      email: this.form.email?.trim() || null,
      password: this.form.password || null,
    };
    this.saving = true;
    this.error = '';
    const save$ = this.uuid
      ? this.api.updateUser(this.uuid, request)
      : this.api.createUser(request);
    save$.subscribe({
      next: () => this.router.navigate(['/admin/users']),
      error: () => {
        this.saving = false;
        this.error = t('adminUserForm.errors.save');
      },
    });
  }

  protected async remove(): Promise<void> {
    if (
      !this.uuid ||
      !(await this.confirmDialog.confirmDelete(this.form.displayName || this.form.username))
    ) {
      return;
    }
    this.api.deleteUser(this.uuid).subscribe({
      next: () => this.router.navigate(['/admin/users']),
      error: () => {
        this.error = t('adminUserForm.errors.delete');
      },
    });
  }

  private load(): void {
    this.loading = true;
    forkJoin({ users: this.api.users(), groups: this.api.groups() }).subscribe({
      next: ({ users, groups }) => {
        this.groups = groups;
        if (this.uuid) {
          const user = users.find((entry) => entry.uuid === this.uuid);
          if (!user) {
            this.error = t('adminUserForm.errors.notFound');
          } else {
            this.form = {
              username: user.username,
              displayName: user.displayName ?? '',
              email: user.email ?? '',
              password: '',
              role: user.role?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER',
              enabled: user.enabled,
              groupUuids: [...user.groupUuids],
            };
            this.isSelf = this.authState.getCurrentUser()?.username === user.username;
            this.sourceProvider = user.sourceProvider ?? 'LOCAL';
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

  private emptyForm(): AdminUserRequest {
    return {
      username: '',
      displayName: '',
      email: '',
      password: '',
      role: 'USER',
      enabled: true,
      groupUuids: [],
    };
  }
}
