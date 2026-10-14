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

  protected previewCount: number | null = null;
  protected previewLoading = false;
  protected loading = false;
  protected starting = false;
  protected error = '';

  /** Only assets whose recurring inspection is overdue or due within {@link dueWithinDays}. */
  protected onlyDue = false;
  protected dueWithinDays = 7;
  protected readonly intervalText = intervalText;

  private readonly previewRequests = new Subject<void>();
  private previewSubscription?: Subscription;

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
      areas: this.areaService.load(),
    }).subscribe({
      next: ({ types, locations, assetTypes, tags }) => {
        // editors also get types of other areas; only those the user may inspect can be started
        this.types = types.filter((type) => type.usable).sort((a, b) => a.name.localeCompare(b.name));
        this.locations = locations;
        this.assetTypes = assetTypes;
        this.tags = tags;
        // "?type=...&due=1" (from the overview of due inspections) preselects
        const preset = this.route.snapshot.queryParamMap.get('type');
        this.onlyDue = this.route.snapshot.queryParamMap.get('due') === '1';
        this.selectType(preset ?? (this.types.length === 1 ? this.types[0].uuid : null));
        this.loading = false;
        this.filterChanged();
      },
      error: () => {
        this.error = 'Daten konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  ngOnDestroy(): void {
    this.previewSubscription?.unsubscribe();
  }

  protected get typeOptions(): SelectOption[] {
    return this.types.map((type) => ({ value: type.uuid, label: type.name, color: type.color, hint: type.description ?? undefined }));
  }

  protected get locationOptions(): SelectOption[] {
    return this.locations
      .map((location) => ({ value: location.uuid, label: locationPath(this.locations, location), hint: location.address ?? undefined }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get assetTypeOptions(): SelectOption[] {
    return this.assetTypes.map((type) => ({ value: type.uuid, label: type.name })).sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get tagOptions(): SelectOption[] {
    return this.tags.map((tag) => ({ value: tag.uuid, label: tag.name, color: tag.color })).sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get areaOptions(): SelectOption[] {
    return this.areaService.areas.map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
  }

  protected get selectedType(): InspectionType | null {
    return this.types.find((type) => type.uuid === this.typeUuid) ?? null;
  }

  protected selectType(uuid: string | null): void {
    this.typeUuid = uuid;
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
    this.api.create(this.typeUuid, this.title.trim(), this.filter, onlyDue, this.dueWithinDays).subscribe({
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
