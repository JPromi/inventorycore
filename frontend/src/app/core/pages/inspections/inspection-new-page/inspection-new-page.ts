import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideClipboardCheck, LucidePlay } from '@lucide/angular';
import { Subject, Subscription, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';

import { MultiSelect } from '../../../components/multi-select/multi-select';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import { AreaService } from '../../../service/area.service';
import { InspectionFilter, InspectionService, InspectionType, intervalText } from '../../../service/inspection.service';
import { InventoryApiService, InventoryItem, TagItem } from '../../../service/inventory-api.service';
import { locationPath } from '../../../util/location-utils';

/** Start an inspection: choose the type and filter which assets are expected. */
@Component({
  selector: 'app-inspection-new-page',
  imports: [FormsModule, RouterLink, MultiSelect, SearchSelect, LucideArrowLeft, LucideClipboardCheck, LucidePlay],
  templateUrl: './inspection-new-page.html',
  styleUrl: './inspection-new-page.scss',
})
export class InspectionNewPage implements OnInit, OnDestroy {
  protected types: InspectionType[] = [];
  protected typeUuid: string | null = null;
  protected title = '';
  private titleTouched = false;
  protected filter: InspectionFilter = { locationUuid: null, includeSubLocations: true, tagUuids: [], assetTypeUuids: [], areaUuids: [] };

  protected locations: InventoryItem[] = [];
  protected assetTypes: InventoryItem[] = [];
  protected tags: TagItem[] = [];
  /** All visible assets: which types, tags and locations occur in the chosen areas. */
  private assets: InventoryItem[] = [];

  protected previewCount: number | null = null;
  protected previewLoading = false;
  protected loading = false;
  protected starting = false;
  protected error = '';

  /** Only assets whose recurring inspection is overdue or due within {@link dueWithinDays}. */
  protected onlyDue = false;
  /** inventory: also in order / defect (default from the type) */
  protected checkFunction = false;
  protected dueWithinDays = 7;
  protected readonly intervalText = intervalText;

  private readonly previewRequests = new Subject<void>();
  private previewSubscription?: Subscription;
  private areaSubscription?: Subscription;

  constructor(
    private readonly api: InspectionService,
    private readonly inventory: InventoryApiService,
    protected readonly areaService: AreaService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.previewSubscription = this.previewRequests
      .pipe(
        debounceTime(250),
        switchMap(() =>
          this.api
            .preview(this.typeUuid, { ...this.filter }, this.onlyDue && !!this.selectedType?.intervalValue, this.dueWithinDays)
            .pipe(catchError(() => of(null))),
        ),
      )
      .subscribe((count) => {
        this.previewCount = count;
        this.previewLoading = false;
      });

    this.loading = true;
    const optional = <T>(request: ReturnType<InventoryApiService['list']>) => request.pipe(catchError(() => of([] as T[])));
    forkJoin({
      types: this.api.types(),
      locations: optional<InventoryItem>(this.inventory.list('locations')),
      assetTypes: optional<InventoryItem>(this.inventory.list('asset-types')),
      tags: optional<TagItem>(this.inventory.list('tags')),
      assets: optional<InventoryItem>(this.inventory.list('assets')),
      areas: this.areaService.load(),
    }).subscribe({
      next: ({ types, locations, assetTypes, tags, assets }) => {
        // editors also get types of other areas; only those the user may inspect can be started
        this.types = types.filter((type) => type.usable).sort((a, b) => a.name.localeCompare(b.name));
        this.locations = locations;
        this.assetTypes = assetTypes;
        this.tags = tags;
        this.assets = assets;
        // start with the areas chosen in the sidebar
        this.filter.areaUuids = [...this.areaService.selected];
        // "?type=...&due=1" (from the overview of due inspections) preselects
        const preset = this.route.snapshot.queryParamMap.get('type');
        this.onlyDue = this.route.snapshot.queryParamMap.get('due') === '1';
        this.selectType(preset ?? (this.types.length === 1 ? this.types[0].uuid : null));
        this.loading = false;
        this.filterChanged();
        // follow the sidebar while the page is open
        this.areaSubscription = this.areaService.selected$.subscribe((selected) => {
          if (!sameSet(selected, this.filter.areaUuids)) {
            this.filter.areaUuids = [...selected];
            this.areasChanged();
          }
        });
      },
      error: () => {
        this.error = 'Daten konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  ngOnDestroy(): void {
    this.previewSubscription?.unsubscribe();
    this.areaSubscription?.unsubscribe();
  }

  /** Kinds of inspection for the chosen areas (those without areas are for all). */
  protected get typeOptions(): SelectOption[] {
    return this.types.filter((type) => this.inScope(type.areaUuids) || type.uuid === this.typeUuid).map((type) => ({ value: type.uuid, label: type.name, color: type.color, hint: type.description ?? undefined }));
  }

  /** Locations of the chosen areas, and those where assets of these areas are. */
  protected get locationOptions(): SelectOption[] {
    const used = new Set(this.scopedAssets.map((asset) => asset.locationUuid));
    return this.locations
      .filter((location) => this.inScope(location.areaUuids) || used.has(location.uuid) || location.uuid === this.filter.locationUuid)
      .map((location) => ({ value: location.uuid, label: locationPath(this.locations, location), hint: location.address ?? undefined }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Types of the chosen areas, and types of the assets there. */
  protected get assetTypeOptions(): SelectOption[] {
    const used = new Set(this.scopedAssets.map((asset) => asset.assetTypeUuid));
    return this.assetTypes
      .filter((type) => (this.filter.areaUuids.length ? used.has(type.uuid) || this.inScope(type.areaUuids, false) : true))
      .map((type) => ({ value: type.uuid, label: type.name })).sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Tags are global; offer those used by assets of the chosen areas. */
  protected get tagOptions(): SelectOption[] {
    const used = new Set(this.scopedAssets.flatMap((asset) => asset.tags ?? []).map((tag) => tag.uuid));
    return this.tags
      .filter((tag) => !this.filter.areaUuids.length || used.has(tag.uuid))
      .map((tag) => ({ value: tag.uuid, label: tag.name, color: tag.color })).sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get areaOptions(): SelectOption[] {
    return this.areaService.areas.map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
  }

  /** Assets in the chosen areas (all when no area is chosen). */
  private get scopedAssets(): InventoryItem[] {
    return this.assets.filter((asset) => this.inScope(asset.areaUuids, false));
  }

  /**
   * Whether something with these areas belongs to the chosen ones. Nothing chosen = everything;
   * without own areas it counts as "for all areas" unless `emptyMatches` is false.
   */
  private inScope(areaUuids: string[] | null | undefined, emptyMatches = true): boolean {
    const chosen = this.filter.areaUuids;
    if (!chosen.length) {
      return true;
    }
    if (!areaUuids?.length) {
      return emptyMatches;
    }
    return areaUuids.some((uuid) => chosen.includes(uuid));
  }

  /** Other areas: drop choices that are not offered any more, then count again. */
  protected areasChanged(): void {
    const keep = (values: string[], options: SelectOption[]) => values.filter((value) => options.some((option) => option.value === value));
    this.filter.tagUuids = keep(this.filter.tagUuids, this.tagOptions);
    this.filter.assetTypeUuids = keep(this.filter.assetTypeUuids, this.assetTypeOptions);
    if (this.filter.locationUuid && !this.isScopedLocation(this.filter.locationUuid)) {
      this.filter.locationUuid = null;
    }
    if (this.selectedType && !this.inScope(this.selectedType.areaUuids)) {
      this.selectType(null);
    }
    this.filterChanged();
  }

  private isScopedLocation(uuid: string): boolean {
    const location = this.locations.find((entry) => entry.uuid === uuid);
    return !!location && (this.inScope(location.areaUuids) || this.scopedAssets.some((asset) => asset.locationUuid === uuid));
  }

  protected get selectedType(): InspectionType | null {
    return this.types.find((type) => type.uuid === this.typeUuid) ?? null;
  }

  protected selectType(uuid: string | null): void {
    this.typeUuid = uuid;
    this.checkFunction = !!this.selectedType?.checkFunction;
    if (!this.titleTouched) {
      this.title = this.defaultTitle();
    }
    if (!this.loading) {
      this.filterChanged();
    }
  }

  protected titleChanged(): void {
    this.titleTouched = true;
  }

  protected filterChanged(): void {
    if (!this.titleTouched) {
      this.title = this.defaultTitle();
    }
    this.previewLoading = true;
    this.previewRequests.next();
  }

  protected start(): void {
    if (!this.typeUuid || this.starting) {
      this.error = this.typeUuid ? '' : 'Bitte eine Prüfungsart wählen.';
      return;
    }
    this.starting = true;
    this.error = '';
    const onlyDue = this.onlyDue && !!this.selectedType?.intervalValue;
    const checkFunction = this.selectedType?.mode === 'INVENTORY' ? this.checkFunction : null;
    this.api.create(this.typeUuid, this.title.trim(), this.filter, onlyDue, this.dueWithinDays, checkFunction).subscribe({
      next: (inspection) => this.router.navigate(['/inspections', inspection.summary.uuid]),
      error: () => {
        this.starting = false;
        this.error = 'Prüfung konnte nicht gestartet werden.';
      },
    });
  }

  /** "Fahrzeugprüfung – Garage – 14.10.2026" */
  private defaultTitle(): string {
    const location = this.locations.find((entry) => entry.uuid === this.filter.locationUuid);
    const due = this.onlyDue && this.selectedType?.intervalValue ? 'fällige' : null;
    return [this.selectedType?.name ?? 'Prüfung', due, location?.name, new Date().toLocaleDateString('de-AT')].filter(Boolean).join(' – ');
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}
