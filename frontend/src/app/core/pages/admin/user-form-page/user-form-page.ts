import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideSave, LucideTrash2, LucideUser } from '@lucide/angular';
import { forkJoin } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { MultiSelect } from '../../../components/multi-select/multi-select';
import { SelectOption } from '../../../components/search-select/search-select';
import { AdminApiService, AdminGroup, AdminUserRequest, AuthProvider, PROVIDER_LABELS } from '../../../service/admin-api.service';
import { AuthStateService } from '../../../service/auth-state.service';

@Component({
  selector: 'app-user-form-page',
  imports: [FormsModule, RouterLink, MultiSelect, LucideArrowLeft, LucideSave, LucideTrash2, LucideUser],
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
    return this.uuid ? 'Benutzer bearbeiten' : 'Benutzer erstellen';
  }

  protected get groupOptions(): SelectOption[] {
    return this.groups
      .map((group) => ({ value: group.uuid, label: group.name, hint: `${group.permissions.length} Berechtigungen` }))
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
      this.error = 'Benutzername ist erforderlich.';
      return;
    }
    if (this.passwordRequired && !this.form.password) {
      this.error = 'Für neue Benutzer ist ein Passwort erforderlich.';
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
    const save$ = this.uuid ? this.api.updateUser(this.uuid, request) : this.api.createUser(request);
    save$.subscribe({
      next: () => this.router.navigate(['/admin/users']),
      error: () => {
        this.saving = false;
        this.error = 'Speichern fehlgeschlagen. Ist der Benutzername bereits vergeben?';
      },
    });
  }

  protected async remove(): Promise<void> {
    if (!this.uuid || !(await this.confirmDialog.confirmDelete(this.form.displayName || this.form.username))) {
      return;
    }
    this.api.deleteUser(this.uuid).subscribe({
      next: () => this.router.navigate(['/admin/users']),
      error: () => {
        this.error = 'Benutzer konnte nicht gelöscht werden.';
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
            this.error = 'Benutzer wurde nicht gefunden.';
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
        this.error = 'Daten konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  private emptyForm(): AdminUserRequest {
    return { username: '', displayName: '', email: '', password: '', role: 'USER', enabled: true, groupUuids: [] };
  }
}
