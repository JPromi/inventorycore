import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideChevronRight,
  LucideLayers,
  LucideGrid2X2,
  LucideList,
  LucideMapPin,
  LucidePencil,
  LucidePlus,
  LucidePrinter,
  LucideRefreshCw,
  LucideSearch,
  LucideShapes,
  LucideTrash2,
  LucideX,
  type LucideIcon,
} from '@lucide/angular';

import { ConfirmDialogService } from '../../components/confirm-dialog/confirm-dialog.service';
import { ListAction, ListActions, SelectableRow, SelectionCheckbox } from '../../components/list-actions/list-actions';
import { FilterBar } from '../../components/filter-bar/filter-bar';
import { InfiniteScroll } from '../../components/infinite-scroll.directive';
import { SearchSelect, SelectOption } from '../../components/search-select/search-select';
import { PermissionResourceType } from '../../entities/user.entity';
import { LabelPrintDialog } from '../../labels/label-print-dialog/label-print-dialog';
import { AreaService } from '../../service/area.service';
import { InspectionDue, InspectionService, dueText } from '../../service/inspection.service';
import { InventoryApiService, InventoryItem, InventoryRequest, TagItem } from '../../service/inventory-api.service';
import { PermissionService } from '../../service/permission.service';
import { locationPath } from '../../util/location-utils';
import { PagedList, SEARCH_DELAY_MS } from '../../util/paged-list';
import { locationTypeInfo } from '../../util/location-types';
import { Observable, Subject, Subscription, debounceTime, skip } from 'rxjs';

type ViewMode = 'grid' | 'list';

interface PageConfig {
  title: string;
  endpoint: string;
  resourceType: PermissionResourceType;
  icon: LucideIcon;
  fields: FieldConfig[];
  createRoute?: string;
  editRoutePrefix?: string;
  detailRoutePrefix?: string;
  filter?: FilterConfig;
}

type SearchField = 'name' | 'description' | 'address' | 'invId' | 'serialNumber' | 'inventoryNumber' | 'tags';

interface FilterConfig {
  searchFields: SearchField[];
  searchPlaceholder?: string;
  tags?: boolean;
  locations?: boolean;
  assetTypes?: boolean;
  areas?: boolean;
}

interface FieldConfig {
  key: keyof InventoryRequest;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'color';
  required?: boolean;
}

@Component({
  selector: 'app-inventory-page',
  imports: [
    CommonModule,
    ListActions,
    SelectableRow,
    SelectionCheckbox,
    FormsModule,
    FilterBar,
    InfiniteScroll,
    LabelPrintDialog,
    SearchSelect,
    LucideChevronRight,
    LucideLayers,
    LucideGrid2X2,
    LucideList,
    LucideMapPin,
    LucidePencil,
    LucidePlus,
    LucideRefreshCw,
    LucideSearch,
    LucideShapes,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './inventory-page.html',
  styleUrl: './inventory-page.scss',
})
export class InventoryPage implements OnInit, OnDestroy {
  protected readonly iconInputs = { size: 18 };
  protected readonly placeholderIconInputs = { size: 22 };
  protected config!: PageConfig;
  /** The searched list, loaded page by page from the server while scrolling. */
  protected list = new PagedList<InventoryItem>((page, size) => this.api.page<InventoryItem>(this.config.endpoint, this.query, page, size));
  protected readonly canBulkDelete = (item: InventoryItem) => this.permissions.can(this.config.resourceType, 'delete', item.areaUuids ?? []);
  protected bulkDelete!: (item: InventoryItem) => Observable<unknown>;
  protected bulkActions: ListAction<InventoryItem>[] = [];
  /** Assets whose labels are being printed (dialog open while set). */
  protected printAssets: InventoryItem[] | null = null;
  protected error = '';
  protected viewMode: ViewMode = 'list';
  protected search = '';
  protected tagFilter: string | null = null;
  protected locationFilter: string | null = null;
  protected assetTypeFilter: string | null = null;
  protected areaFilter: string | null = null;
  protected tags: TagItem[] = [];
  protected locations: InventoryItem[] = [];
  protected assetTypes: InventoryItem[] = [];
  /** Most urgent due recurring inspection per asset (only overdue / due soon). */
  protected dueByAsset = new Map<string, InspectionDue>();

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;
  private readonly searchChanges = new Subject<void>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InventoryApiService,
    private readonly confirmDialog: ConfirmDialogService,
    protected readonly permissions: PermissionService,
    protected readonly areaService: AreaService,
    private readonly inspections: InspectionService,
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.config = data['inventoryConfig'];
      const endpoint = this.config.endpoint;
      this.bulkDelete = item => this.api.delete(endpoint, item.uuid);
      this.bulkActions = endpoint === 'assets'
        ? [{ label: 'Labels drucken', icon: LucidePrinter, run: items => (this.printAssets = items) }]
        : [];
      this.resetFilters();
      this.loadFilterOptions();
    });
    // the sidebar area selection is a server filter too
    this.subscriptions.add(this.areaService.selected$.pipe(skip(1)).subscribe(() => this.list.reload()));
    this.subscriptions.add(this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.list.destroy();
  }

  /** Filters for the server; `areas` is the sidebar selection (tags are global). */
  private get query(): Record<string, string | string[] | null> {
    return {
      q: this.search,
      tag: this.tagFilter,
      location: this.locationFilter,
      assetType: this.assetTypeFilter,
      area: this.areaFilter,
      areas: this.config.endpoint === 'tags' ? [] : this.areaService.selected,
    };
  }

  /** "/" focuses the search like in many web apps. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
    }
  }

  protected get selectedAreaNames(): string[] {
    return this.areaService.selected.map((uuid) => this.areaService.name(uuid));
  }

  /** Area names are only interesting when the user works with more than one area. */
  protected itemAreas(item: InventoryItem): string[] {
    if (this.areaService.areas.length < 2) {
      return [];
    }
    return (item.areaUuids ?? []).map((uuid) => this.areaService.name(uuid));
  }

  /** Set filters without the search (for the folded filter button on phones). */
  protected get activeFilterCount(): number {
    return [this.tagFilter, this.locationFilter, this.assetTypeFilter, this.areaFilter].filter(Boolean).length;
  }

  protected get hasActiveFilters(): boolean {
    return !!this.search.trim() || !!this.tagFilter || !!this.locationFilter || !!this.assetTypeFilter || !!this.areaFilter;
  }

  protected get tagOptions(): SelectOption[] {
    return this.tags.map((tag) => ({ value: tag.uuid, label: tag.name, color: tag.color }));
  }

  protected get locationOptions(): SelectOption[] {
    return this.locations
      .map((location) => ({ value: location.uuid, label: locationPath(this.locations, location), hint: location.address ?? undefined }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Only areas inside the sidebar selection (if any) make sense as filter. */
  protected get areaOptions(): SelectOption[] {
    const selected = this.areaService.selected;
    return this.areaService.areas
      .filter((area) => !selected.length || selected.includes(area.uuid))
      .map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
  }

  protected get assetTypeOptions(): SelectOption[] {
    return this.assetTypes.map((type) => ({ value: type.uuid, label: type.name }));
  }

  /** Search: waits for a pause in typing; other filters reload right away. */
  protected onSearchChange(): void {
    this.searchChanges.next();
  }

  protected onFilterChange(): void {
    this.list.reload();
  }

  protected clearSearch(): void {
    this.search = '';
    this.onFilterChange();
    this.searchInput?.nativeElement.focus();
  }

  protected resetFilters(): void {
    this.search = '';
    this.tagFilter = null;
    this.locationFilter = null;
    this.assetTypeFilter = null;
    this.areaFilter = null;
    this.load();
  }

  protected load(): void {
    this.error = '';
    this.loadDueInspections();
    this.list.reload();
  }

  /** Entries removed by a (batch) delete leave the loaded list without reloading it. */
  protected removed(uuids: string[]): void {
    this.list.remove((item) => uuids.includes(item.uuid));
  }

  /** "Prüfung überfällig seit 3 Tagen (Bremsen)" */
  protected dueTitle(due: InspectionDue): string {
    return `${due.inspectionTypeName}: ${dueText(due.daysUntilDue)}`;
  }

  private loadDueInspections(): void {
    this.dueByAsset = new Map();
    if (this.config.endpoint !== 'assets' || !this.permissions.can('ASSET', 'inspect')) {
      return;
    }
    this.inspections.schedules().subscribe({
      next: (entries) => {
        const map = new Map<string, InspectionDue>();
        for (const entry of entries) {
          const current = map.get(entry.assetUuid);
          if (entry.state !== 'OK' && (!current || entry.daysUntilDue < current.daysUntilDue)) {
            map.set(entry.assetUuid, entry);
          }
        }
        this.dueByAsset = map;
      },
      // the list works without due dates
      error: () => (this.dueByAsset = new Map()),
    });
  }

  protected startCreate(): void {
    if (this.config.createRoute) {
      this.router.navigate([this.config.createRoute]);
    }
  }

  protected open(item: InventoryItem): void {
    if (this.config.detailRoutePrefix) {
      this.router.navigate([this.config.detailRoutePrefix, item.uuid]);
    } else if (this.config.editRoutePrefix && this.permissions.can(this.config.resourceType, 'edit', item.areaUuids ?? [])) {
      this.startEdit(item);
    }
  }

  protected get itemsClickable(): boolean {
    return !!this.config.detailRoutePrefix || !!this.config.editRoutePrefix;
  }

  protected startEdit(item: InventoryItem, event?: Event): void {
    event?.stopPropagation();
    if (this.config.editRoutePrefix) {
      this.router.navigate([this.config.editRoutePrefix, item.uuid, 'edit']);
    }
  }

  protected async remove(item: InventoryItem, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!(await this.confirmDialog.confirmDelete(item.name))) {
      return;
    }

    this.api.delete(this.config.endpoint, item.uuid).subscribe({
      next: () => this.removed([item.uuid]),
      error: (error) => {
        this.error = this.config.endpoint === 'assets' && error.status === 409
          ? 'Das Asset hat noch untergeordnete Assets. Bitte zuerst deren Zuordnung ändern.' : 'Löschen fehlgeschlagen.';
      },
    });
  }

  protected thumbnail(item: InventoryItem): string | null {
    const images = item.images ?? [];
    const cover = images.find((image) => image.kind === 'THUMBNAIL') ?? images[0];
    return cover?.thumbnailUrl || cover?.url || null;
  }

  /** Placeholder without picture: locations show the icon of their kind. */
  protected itemIcon(item: InventoryItem): LucideIcon {
    return this.config.endpoint === 'locations' ? locationTypeInfo(item.locationType).icon : this.config.icon;
  }

  protected itemMeta(item: InventoryItem): string {
    if (item.invId) {
      return item.invId;
    }
    if (this.config.endpoint === 'locations') {
      const parent = this.locations.find((location) => location.uuid === item.parentLocationUuid);
      const type = item.locationType && item.locationType !== 'OTHER' ? locationTypeInfo(item.locationType).label : '';
      return [type, parent ? `in ${locationPath(this.locations, parent)}` : '', item.address ?? ''].filter(Boolean).join(' · ');
    }
    if (item.address) {
      return item.address;
    }
    if (item.inspectionIntervalDays) {
      return `Prüfung alle ${item.inspectionIntervalDays} Tage`;
    }
    return '';
  }

  protected assetTypeName(item: InventoryItem): string | null {
    return this.assetTypes.find((type) => type.uuid === item.assetTypeUuid)?.name ?? null;
  }

  protected locationName(item: InventoryItem): string | null {
    const location = this.locations.find((entry) => entry.uuid === item.locationUuid);
    return location ? locationPath(this.locations, location) : null;
  }

  protected itemTags(item: InventoryItem): TagItem[] {
    const typeTags = this.assetTypes.find((type) => type.uuid === item.assetTypeUuid)?.tags ?? [];
    const own = item.tags ?? [];
    const ownUuids = new Set(own.map((tag) => tag.uuid));
    return [...own, ...typeTags.filter((tag) => !ownUuids.has(tag.uuid))];
  }

  private loadFilterOptions(): void {
    const filter = this.config.filter;
    this.tags = [];
    this.locations = [];
    this.assetTypes = [];
    if (filter?.tags) {
      this.api.list<TagItem>('tags').subscribe({
        next: (tags) => (this.tags = tags.sort((a, b) => a.name.localeCompare(b.name))),
        error: () => (this.tags = []),
      });
    }
    // locations: also for the parent path shown in the location list
    if (filter?.locations || this.config.endpoint === 'locations') {
      this.api.list<InventoryItem>('locations').subscribe({
        next: (locations) => (this.locations = locations),
        error: () => (this.locations = []),
      });
    }
    if (filter?.assetTypes || filter?.tags) {
      this.api.list<InventoryItem>('asset-types').subscribe({
        next: (types) => (this.assetTypes = types.sort((a, b) => a.name.localeCompare(b.name))),
        error: () => (this.assetTypes = []),
      });
    }
  }
}
