import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucidePencil, LucideSearch, LucideTrash2, LucideUser, LucideUserPlus, LucideX } from '@lucide/angular';
import { Subject, debounceTime } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { FilterBar } from '../../../components/filter-bar/filter-bar';
import { InfiniteScroll } from '../../../components/infinite-scroll.directive';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import { AdminApiService, AdminGroup, AdminUser, PROVIDER_LABELS } from '../../../service/admin-api.service';
import { AuthStateService } from '../../../service/auth-state.service';
import { PagedList, SEARCH_DELAY_MS } from '../../../util/paged-list';

@Component({
  selector: 'app-users-page',
  imports: [InfiniteScroll, ListActions, SelectableRow, SelectionCheckbox, FormsModule, FilterBar, SearchSelect, LucidePencil, LucideSearch, LucideTrash2, LucideUser, LucideUserPlus, LucideX],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage implements OnInit, OnDestroy {
  protected readonly canBulkDelete = (user: AdminUser) => !this.isSelf(user);
  protected readonly bulkDelete = (user: AdminUser) => this.api.deleteUser(user.uuid);
  protected readonly providerLabels = PROVIDER_LABELS;
  /** Searched and filtered on the server, loaded page by page while scrolling. */
  protected readonly list = new PagedList<AdminUser>((page, size) =>
    this.api.userPage({ q: this.search, group: this.groupFilter, status: this.statusFilter }, page, size));
  protected groups: AdminGroup[] = [];
  protected error = '';
  protected search = '';
  protected groupFilter: string | null = null;
  protected statusFilter: string | null = null;
  protected readonly statusOptions: SelectOption[] = [
    { value: 'enabled', label: 'Aktiv' },
    { value: 'disabled', label: 'Deaktiviert' },
    { value: 'admin', label: 'Administratoren' },
  ];
  private readonly searchChanges = new Subject<void>();
  private readonly searchSubscription = this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload());

  constructor(
    private readonly api: AdminApiService,
    private readonly router: Router,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly authState: AuthStateService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  protected get users(): AdminUser[] {
    return this.list.items;
  }

  ngOnDestroy(): void {
    this.searchSubscription.unsubscribe();
    this.list.destroy();
  }

  protected onSearchChange(): void {
    this.searchChanges.next();
  }

  protected clearSearch(): void {
    this.search = '';
    this.list.reload();
  }

  /** Entries removed by a (batch) delete. */
  protected removed(uuids: string[]): void {
    this.list.remove((item) => uuids.includes(item.uuid));
  }

  protected get groupOptions(): SelectOption[] {
    return this.groups.map((group) => ({ value: group.uuid, label: group.name }));
  }

  protected get activeFilterCount(): number {
    return [this.groupFilter, this.statusFilter].filter(Boolean).length;
  }

  protected get hasActiveFilters(): boolean {
    return !!this.search.trim() || !!this.groupFilter || !!this.statusFilter;
  }

  protected resetFilters(): void {
    this.search = '';
    this.groupFilter = null;
    this.statusFilter = null;
    this.list.reload();
  }

  /** Admin by role or through an admin group. */
  protected isAdmin(user: AdminUser): boolean {
    return user.role?.toUpperCase() === 'ADMIN' || this.groups.some((group) => group.adminGroup && user.groupUuids.includes(group.uuid));
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
      next: () => this.removed([user.uuid]),
      error: () => {
        this.error = 'Benutzer konnte nicht gelöscht werden.';
      },
    });
  }

  protected load(): void {
    this.error = '';
    this.list.reload();
    // for the group filter and the group names in the table
    this.api.groups().subscribe({
      next: (groups) => (this.groups = groups),
      error: () => (this.error = 'Gruppen konnten nicht geladen werden.'),
    });
  }
}
