import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideBoxes,
  LucideChevronRight,
  LucideMapPin,
  LucidePencil,
  LucideShapes,
  LucideTrash2,
  type LucideIcon,
} from '@lucide/angular';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ConfirmDialogService } from '../../components/confirm-dialog/confirm-dialog.service';
import { PermissionResourceType } from '../../entities/user.entity';
import { AreaService } from '../../service/area.service';
import { InventoryApiService, InventoryImage, InventoryItem, TagItem } from '../../service/inventory-api.service';
import { PermissionService } from '../../service/permission.service';
import { locationPath, locationWithDescendants } from '../../util/location-utils';

interface DetailConfig {
  title: string;
  endpoint: 'assets' | 'locations' | 'asset-types';
  listRoute: string;
  editRoutePrefix?: string;
  resourceType: PermissionResourceType;
  icon: LucideIcon;
  fields: DetailField[];
}

interface DetailField {
  key: keyof InventoryItem;
  label: string;
  suffix?: string;
}

interface LinkedItem {
  uuid: string;
  name: string;
  hint?: string;
}

const FIELD_TYPE_LABELS: Record<string, string | undefined> = {
  TEXT: 'Text',
  NUMBER: 'Nummer',
  BOOLEAN: 'Ja/Nein',
  DATE: 'Datum',
  DATETIME: 'Datum & Zeit',
  URL: 'URL',
  EMAIL: 'E-Mail',
  SELECT: 'Auswahl',
};

@Component({
  selector: 'app-inventory-detail-page',
  imports: [CommonModule, RouterLink, LucideArrowLeft, LucideBoxes, LucideChevronRight, LucideMapPin, LucidePencil, LucideShapes, LucideTrash2],
  templateUrl: './inventory-detail-page.html',
  styleUrl: './inventory-detail-page.scss',
})
export class InventoryDetailPage implements OnInit {
  protected readonly iconInputs = { size: 22 };
  protected readonly placeholderIconInputs = { size: 40 };
  protected readonly fieldTypeLabels = FIELD_TYPE_LABELS;
  protected config!: DetailConfig;
  protected item: InventoryItem | null = null;
  protected loading = false;
  protected error = '';
  protected activeImage: InventoryImage | null = null;
  protected locations: InventoryItem[] = [];
  protected assetTypes: InventoryItem[] = [];
  protected assets: InventoryItem[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InventoryApiService,
    private readonly confirmDialog: ConfirmDialogService,
    protected readonly permissions: PermissionService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.config = data['inventoryDetailConfig'];
    });
    this.route.paramMap.subscribe((params) => {
      const uuid = params.get('uuid');
      if (uuid) {
        this.load(uuid);
      }
    });
  }

  protected get canEdit(): boolean {
    return !!this.item && !!this.config.editRoutePrefix && this.permissions.can(this.config.resourceType, 'edit', this.item.areaUuids ?? []);
  }

  protected get canDelete(): boolean {
    return !!this.item && this.permissions.can(this.config.resourceType, 'delete', this.item.areaUuids ?? []);
  }

  protected get images(): InventoryImage[] {
    const images = [...(this.item?.images ?? [])];
    return images.sort((a, b) => (a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind === 'THUMBNAIL' ? -1 : 1));
  }

  protected get assetType(): InventoryItem | null {
    return this.assetTypes.find((type) => type.uuid === this.item?.assetTypeUuid) ?? null;
  }

  /** Location chain from the root down, used as breadcrumb. */
  protected get locationChain(): InventoryItem[] {
    const startUuid = this.config.endpoint === 'locations' ? this.item?.parentLocationUuid : this.item?.locationUuid;
    const chain: InventoryItem[] = [];
    const visited = new Set<string>();
    let current = this.locations.find((location) => location.uuid === startUuid);
    while (current && !visited.has(current.uuid)) {
      visited.add(current.uuid);
      chain.unshift(current);
      current = this.locations.find((location) => location.uuid === current?.parentLocationUuid);
    }
    return chain;
  }

  protected get areas(): { name: string; color?: string | null }[] {
    return (this.item?.areaUuids ?? []).map((uuid) => {
      const area = this.areaService.areas.find((entry) => entry.uuid === uuid);
      return { name: area?.name ?? 'Bereich ohne Zugriff', color: area?.color };
    });
  }

  protected get ownTags(): TagItem[] {
    return this.item?.tags ?? [];
  }

  protected get inheritedTags(): TagItem[] {
    const own = new Set(this.ownTags.map((tag) => tag.uuid));
    return (this.assetType?.tags ?? []).filter((tag) => !own.has(tag.uuid));
  }

  protected get childLocations(): LinkedItem[] {
    if (!this.item) {
      return [];
    }
    return this.locations
      .filter((location) => location.parentLocationUuid === this.item?.uuid)
      .map((location) => ({ uuid: location.uuid, name: location.name, hint: location.address ?? undefined }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  protected get linkedAssets(): LinkedItem[] {
    if (!this.item) {
      return [];
    }
    let assets: InventoryItem[] = [];
    if (this.config.endpoint === 'locations') {
      const uuids = locationWithDescendants(this.locations, this.item.uuid);
      assets = this.assets.filter((asset) => asset.locationUuid && uuids.has(asset.locationUuid));
    } else if (this.config.endpoint === 'asset-types') {
      assets = this.assets.filter((asset) => asset.assetTypeUuid === this.item?.uuid);
    }
    return assets
      .map((asset) => ({ uuid: asset.uuid, name: asset.name, hint: this.assetHint(asset) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  protected fieldValue(field: DetailField): string | null {
    const value = this.item?.[field.key];
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return `${value}${field.suffix ?? ''}`;
  }

  protected edit(): void {
    if (this.item && this.config.editRoutePrefix) {
      this.router.navigate([this.config.editRoutePrefix, this.item.uuid, 'edit']);
    }
  }

  protected async remove(): Promise<void> {
    if (!this.item || !(await this.confirmDialog.confirmDelete(this.item.name))) {
      return;
    }
    this.api.delete(this.config.endpoint, this.item.uuid).subscribe({
      next: () => this.router.navigate([this.config.listRoute]),
      error: () => {
        this.error = 'Löschen fehlgeschlagen.';
      },
    });
  }

  private assetHint(asset: InventoryItem): string {
    if (this.config.endpoint === 'locations' && asset.locationUuid !== this.item?.uuid) {
      const location = this.locations.find((entry) => entry.uuid === asset.locationUuid);
      return [asset.invId, location ? locationPath(this.locations, location) : null].filter(Boolean).join(' · ');
    }
    return asset.invId ?? '';
  }

  private load(uuid: string): void {
    this.loading = true;
    this.error = '';
    this.item = null;

    const needsAssets = this.config.endpoint !== 'assets' && this.permissions.can('ASSET', 'view');
    const optional = <T>(endpoint: string, wanted: boolean) =>
      wanted ? this.api.list<InventoryItem>(endpoint).pipe(catchError(() => of([] as T[]))) : of([] as T[]);

    forkJoin({
      item: this.api.get<InventoryItem>(this.config.endpoint, uuid),
      areas: this.areaService.load(),
      locations: optional<InventoryItem>('locations', this.permissions.can('LOCATION', 'view')),
      assetTypes: optional<InventoryItem>('asset-types', this.config.endpoint === 'assets'),
      assets: optional<InventoryItem>('assets', needsAssets),
    }).subscribe({
      next: ({ item, locations, assetTypes, assets }) => {
        this.item = item;
        this.locations = locations;
        this.assetTypes = assetTypes;
        this.assets = assets;
        this.activeImage = this.images[0] ?? null;
        this.loading = false;
      },
      error: () => {
        this.error = 'Eintrag konnte nicht geladen werden.';
        this.loading = false;
      },
    });
  }
}
