import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucidePencil, LucidePlus, LucideSearch, LucideTrash2, LucideUsers, LucideX } from '@lucide/angular';
import { Subject, debounceTime } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { InfiniteScroll } from '../../../components/infinite-scroll.directive';
import { AdminApiService, AdminGroup, AdminGroupRow, AdminUser } from '../../../service/admin-api.service';
import { AreaItem } from '../../../service/area.service';
import { PagedList, SEARCH_DELAY_MS } from '../../../util/paged-list';

@Component({
  selector: 'app-groups-page',
  imports: [InfiniteScroll, ListActions, SelectableRow, SelectionCheckbox, FormsModule, LucidePencil, LucidePlus, LucideSearch, LucideTrash2, LucideUsers, LucideX],
  templateUrl: './groups-page.html',
  styleUrl: './groups-page.scss',
})
export class GroupsPage implements OnInit, OnDestroy {
  protected readonly canBulkDelete = (_item: AdminGroup) => true;
  protected readonly bulkDelete = (item: AdminGroup) => this.api.deleteGroup(item.uuid);
  /** Searched on the server (also by member), loaded page by page while scrolling. */
  protected readonly list = new PagedList<AdminGroupRow>((page, size) => this.api.groupPage(this.search, page, size));
  protected areas: AreaItem[] = [];
  protected error = '';
  protected search = '';
  private readonly searchChanges = new Subject<void>();
  private readonly searchSubscription = this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload());

  constructor(
    private readonly api: AdminApiService,
    private readonly router: Router,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  protected get groups(): AdminGroupRow[] {
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

  /** The first few members (the server sends up to five), see `memberCount` for all. */
  protected members(group: AdminGroupRow): AdminUser[] {
    return group.members;
  }

  /** Areas the group has any permission in, e.g. "EDV", "Facility" or "Alle Bereiche". */
  protected permissionAreas(group: AdminGroup): { name: string; color?: string | null }[] {
    if (group.permissions.some((permission) => !permission.areaUuid)) {
      return [{ name: 'Alle Bereiche' }];
    }
    const uuids = new Set(group.permissions.map((permission) => permission.areaUuid));
    return this.areas.filter((area) => uuids.has(area.uuid)).map((area) => ({ name: area.name, color: area.color }));
  }

  protected create(): void {
    this.router.navigate(['/admin/groups/new']);
  }

  protected edit(group: AdminGroup): void {
    this.router.navigate(['/admin/groups', group.uuid, 'edit']);
  }

  protected async remove(group: AdminGroup, event: Event): Promise<void> {
    event.stopPropagation();
    if (!(await this.confirmDialog.confirmDelete(group.name))) {
      return;
    }
    this.api.deleteGroup(group.uuid).subscribe({
      next: () => this.removed([group.uuid]),
      error: () => {
        this.error = 'Gruppe konnte nicht gelöscht werden.';
      },
    });
  }

  protected load(): void {
    this.error = '';
    this.list.reload();
    // for the area names of the permissions
    this.api.areas().subscribe({ next: (areas) => (this.areas = areas) });
  }
}
