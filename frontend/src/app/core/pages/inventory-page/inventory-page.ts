import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideGrid2X2,
  LucideList,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideTrash2,
  type LucideIcon,
} from '@lucide/angular';

import { PermissionResourceType } from '../../entities/user.entity';
import { InventoryApiService, InventoryItem, InventoryRequest } from '../../service/inventory-api.service';
import { PermissionService } from '../../service/permission.service';

type ViewMode = 'grid' | 'list';

interface PageConfig {
  title: string;
  endpoint: string;
  resourceType: PermissionResourceType;
  icon: LucideIcon;
  fields: FieldConfig[];
  createRoute?: string;
  editRoutePrefix?: string;
}

interface FieldConfig {
  key: keyof InventoryRequest;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'color';
  required?: boolean;
}

@Component({
  selector: 'app-inventory-page',
  imports: [CommonModule, LucideGrid2X2, LucideList, LucidePencil, LucidePlus, LucideRefreshCw, LucideTrash2],
  templateUrl: './inventory-page.html',
  styleUrl: './inventory-page.scss',
})
export class InventoryPage implements OnInit {
  protected readonly iconInputs = { size: 18 };
  protected config!: PageConfig;
  protected items: InventoryItem[] = [];
  protected loading = false;
  protected error = '';
  protected viewMode: ViewMode = 'list';
  protected page = 1;
  protected pageSize = 8;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InventoryApiService,
    protected readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.config = data['inventoryConfig'];
      this.page = 1;
      this.load();
    });
  }

  protected get visibleItems(): InventoryItem[] {
    return this.permissions.filterVisible(this.items, this.config.resourceType);
  }

  protected get pageCount(): number {
    return Math.max(1, Math.ceil(this.visibleItems.length / this.pageSize));
  }

  protected get pageItems(): InventoryItem[] {
    const start = (this.page - 1) * this.pageSize;
    return this.visibleItems.slice(start, start + this.pageSize);
  }

  protected load(): void {
    this.loading = true;
    this.error = '';
    this.api.list(this.config.endpoint).subscribe({
      next: (items) => {
        this.items = items;
        this.page = Math.min(this.page, this.pageCount);
        this.loading = false;
      },
      error: () => {
        this.error = 'Daten konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  protected startCreate(): void {
    if (this.config.createRoute) {
      this.router.navigate([this.config.createRoute]);
    }
  }

  protected startEdit(item: InventoryItem): void {
    if (this.config.editRoutePrefix) {
      this.router.navigate([this.config.editRoutePrefix, item.uuid, 'edit']);
    }
  }

  protected remove(item: InventoryItem): void {
    if (!window.confirm(`${item.name} wirklich löschen?`)) {
      return;
    }

    this.api.delete(this.config.endpoint, item.uuid).subscribe({
      next: () => this.load(),
      error: () => {
        this.error = 'Löschen fehlgeschlagen.';
      },
    });
  }

  protected setPage(page: number): void {
    this.page = Math.min(this.pageCount, Math.max(1, page));
  }

  protected itemMeta(item: InventoryItem): string {
    if (item.invId) {
      return item.invId;
    }
    if (item.address) {
      return item.address;
    }
    if (item.inspectionIntervalDays) {
      return `Prüfung alle ${item.inspectionIntervalDays} Tage`;
    }
    return item.uuid;
  }

}
