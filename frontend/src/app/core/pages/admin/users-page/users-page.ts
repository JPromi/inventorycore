import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucidePencil, LucideSearch, LucideTrash2, LucideUser, LucideUserPlus, LucideX } from '@lucide/angular';
import { forkJoin } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import { AdminApiService, AdminGroup, AdminUser } from '../../../service/admin-api.service';
import { AuthStateService } from '../../../service/auth-state.service';

@Component({
  selector: 'app-users-page',
  imports: [FormsModule, SearchSelect, LucidePencil, LucideSearch, LucideTrash2, LucideUser, LucideUserPlus, LucideX],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage implements OnInit {
  protected users: AdminUser[] = [];
  protected groups: AdminGroup[] = [];
  protected loading = false;
  protected error = '';
  protected search = '';
  protected groupFilter: string | null = null;
  protected statusFilter: string | null = null;
  protected readonly statusOptions: SelectOption[] = [
    { value: 'enabled', label: 'Aktiv' },
    { value: 'disabled', label: 'Deaktiviert' },
    { value: 'admin', label: 'Administratoren' },
  ];

  constructor(
    private readonly api: AdminApiService,
    private readonly router: Router,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly authState: AuthStateService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  protected get groupOptions(): SelectOption[] {
    return this.groups.map((group) => ({ value: group.uuid, label: group.name }));
  }

  protected get filteredUsers(): AdminUser[] {
    const terms = this.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.users.filter((user) => {
      const text = `${user.username} ${user.displayName ?? ''} ${user.email ?? ''}`.toLowerCase();
      if (!terms.every((term) => text.includes(term))) {
        return false;
      }
      if (this.groupFilter && !user.groupUuids.includes(this.groupFilter)) {
        return false;
      }
      switch (this.statusFilter) {
        case 'enabled':
          return user.enabled;
        case 'disabled':
          return !user.enabled;
        case 'admin':
          return this.isAdmin(user);
        default:
          return true;
      }
    });
  }

  protected get hasActiveFilters(): boolean {
    return !!this.search.trim() || !!this.groupFilter || !!this.statusFilter;
  }

  protected resetFilters(): void {
    this.search = '';
    this.groupFilter = null;
    this.statusFilter = null;
  }

  protected isAdmin(user: AdminUser): boolean {
    return user.role?.toUpperCase() === 'ADMIN';
  }

  protected isSelf(user: AdminUser): boolean {
    return this.authState.getCurrentUser()?.username === user.username;
  }

  protected groupNames(user: AdminUser): string[] {
    return this.groups
      .filter((group) => user.groupUuids.includes(group.uuid))
      .map((group) => group.name)
      .sort((a, b) => a.localeCompare(b));
  }

  protected create(): void {
    this.router.navigate(['/admin/users/new']);
  }

  protected edit(user: AdminUser): void {
    this.router.navigate(['/admin/users', user.uuid, 'edit']);
  }

  protected async remove(user: AdminUser, event: Event): Promise<void> {
    event.stopPropagation();
    if (!(await this.confirmDialog.confirmDelete(user.displayName || user.username))) {
      return;
    }
    this.api.deleteUser(user.uuid).subscribe({
      next: () => this.load(),
      error: () => {
        this.error = 'Benutzer konnte nicht gelöscht werden.';
      },
    });
  }

  private load(): void {
    this.loading = true;
    this.error = '';
    forkJoin({ users: this.api.users(), groups: this.api.groups() }).subscribe({
      next: ({ users, groups }) => {
        this.users = users.sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));
        this.groups = groups;
        this.loading = false;
      },
      error: () => {
        this.error = 'Benutzer konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }
}
