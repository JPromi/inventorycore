import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucidePencil, LucidePlus, LucideSearch, LucideTrash2, LucideUsers, LucideX } from '@lucide/angular';
import { forkJoin } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { AdminApiService, AdminGroup, AdminUser } from '../../../service/admin-api.service';
import { AreaItem } from '../../../service/area.service';

@Component({
  selector: 'app-groups-page',
  imports: [FormsModule, LucidePencil, LucidePlus, LucideSearch, LucideTrash2, LucideUsers, LucideX],
  templateUrl: './groups-page.html',
  styleUrl: './groups-page.scss',
})
export class GroupsPage implements OnInit {
  protected groups: AdminGroup[] = [];
  protected users: AdminUser[] = [];
  protected areas: AreaItem[] = [];
  protected loading = false;
  protected error = '';
  protected search = '';

  constructor(
    private readonly api: AdminApiService,
    private readonly router: Router,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  protected get filteredGroups(): AdminGroup[] {
    const terms = this.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.groups.filter((group) => {
      const members = this.members(group).map((user) => `${user.username} ${user.displayName ?? ''}`).join(' ');
      const text = `${group.name} ${members}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }

  protected members(group: AdminGroup): AdminUser[] {
    return this.users.filter((user) => user.groupUuids.includes(group.uuid));
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
      next: () => this.load(),
      error: () => {
        this.error = 'Gruppe konnte nicht gelöscht werden.';
      },
    });
  }

  private load(): void {
    this.loading = true;
    this.error = '';
    forkJoin({ groups: this.api.groups(), users: this.api.users(), areas: this.api.areas() }).subscribe({
      next: ({ groups, users, areas }) => {
        this.areas = areas;
        this.groups = groups.sort((a, b) => a.name.localeCompare(b.name));
        this.users = users;
        this.loading = false;
      },
      error: () => {
        this.error = 'Gruppen konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }
}
