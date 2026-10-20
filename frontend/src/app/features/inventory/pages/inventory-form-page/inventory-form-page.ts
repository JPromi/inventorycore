import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucidePlus,
  LucideSave,
  LucideTrash2,
  type LucideIcon,
} from '@lucide/angular';

import { ImageUpload } from '../../../../shared/components/image-upload/image-upload';
import { LocationLookup } from '../../../../shared/components/location-lookup/location-lookup';
import { MultiSelect } from '../../../../shared/components/multi-select/multi-select';
import {
  SearchSelect,
  SelectOption,
} from '../../../../shared/components/search-select/search-select';

import { PermissionResourceType } from '../../../../core/entities/user.entity';
import {
  AssetStatus,
  AssetStatusService,
  statusFitsAreas,
  statusName,
} from '../../../asset-statuses/data-access/asset-status.service';
import { randomPresetColor } from '../../../../shared/components/color-picker/color-picker';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AreaService } from '../../../../core/service/area.service';
import { GeocodingResult } from '../../data-access/geocoding.service';
import {
  InventoryApiService,
  InventoryItem,
  InventoryRequest,
  TagItem,
} from '../../data-access/inventory-api.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { locationPath, locationWithDescendants } from '../../../../shared/util/location-utils';
import { LOCATION_TYPES, locationTypeInfo } from '../../../../shared/util/location-types';

interface FormConfig {
  title: string;
  createTitle: string;
  editTitle: string;
  endpoint: string;
  listRoute: string;
  detailRoutePrefix?: string;
  resourceType: PermissionResourceType;
  icon: LucideIcon;
  fields: FieldConfig[];
  customFields?: boolean;
  images?: boolean;
  autoInvId?: boolean;
  selectAssetType?: boolean;
  selectLocation?: boolean;
  selectParentLocation?: boolean;
  /** fixed location kind (building, shelf, ...) */
  locationType?: boolean;
  /** address parts and latitude/longitude with lookups (locations) */
  coordinates?: boolean;
  tags?: boolean;
}

interface FieldConfig {
  key: keyof InventoryRequest;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'color';
  required?: boolean;
}

@Component({
  selector: 'app-inventory-form-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ImageUpload,
    LocationLookup,
    MultiSelect,
    SearchSelect,
    LucideArrowLeft,
    LucidePlus,
    LucideSave,
    LucideTrash2,
    TranslatePipe,
  ],
  templateUrl: './inventory-form-page.html',
  styleUrl: './inventory-form-page.scss',
})
export class InventoryFormPage implements OnInit {
  protected readonly iconInputs = { size: 20 };
  protected readonly locationTypeOptions: SelectOption[] = LOCATION_TYPES.map((type) => ({
    value: type.value,
    label: type.label,
    hint: type.hint,
  }));
  protected config!: FormConfig;
  protected uuid: string | null = null;
  protected loading = false;
  protected error = '';
  protected form: InventoryRequest = this.emptyForm();
  protected assetTypes: InventoryItem[] = [];
  protected assets: InventoryItem[] = [];
  protected locations: InventoryItem[] = [];
  protected tags: TagItem[] = [];
  protected selectedTagUuids: string[] = [];
  protected lockedTags: TagItem[] = [];
  protected saving = false;
  /** Areas the user may change on this object. */
  protected selectedAreaUuids: string[] = [];
  /** assets: statuses to choose from and the status the asset had when the form opened */
  protected statuses: AssetStatus[] = [];
  protected originalStatusUuid: string | null = null;
  /** Assigned areas the user has no rights in; they are kept unchanged. */
  protected lockedAreaUuids: string[] = [];
  private originalAreaUuids: string[] = [];
  /** Shown after "Erstellen & neu" so the user knows the previous entry was saved. */
  protected lastCreated: { uuid: string; name: string } | null = null;
  /** Images are still uploading; saving waits for them. */
  protected uploading = false;
  /** Free-text address of an older location, moved into the street field for splitting up. */
  protected legacyAddress = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InventoryApiService,
    protected readonly permissions: PermissionService,
    private readonly areaService: AreaService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly assetStatuses: AssetStatusService,
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.config = data['inventoryFormConfig'];
      this.uuid = this.route.snapshot.paramMap.get('uuid');
      this.form = this.emptyForm();
      this.legacyAddress = '';
      if (this.config.endpoint === 'assets') {
        this.api.list<InventoryItem>('assets').subscribe({
          next: (assets) => (this.assets = assets),
          error: () => (this.error = t('inventoryForm.errors.loadAssets')),
        });
        if (!this.uuid)
          this.form.parentAssetUuid = this.route.snapshot.queryParamMap.get('parentAssetUuid');
        this.originalStatusUuid = null;
        this.loadStatuses();
      }
      this.originalAreaUuids = [];
      this.lockedAreaUuids = [];
      this.selectedAreaUuids = [];
      this.lastCreated = null;

      if (this.uuid) {
        this.load(this.uuid);
      } else {
        this.areaService.load().subscribe(() => (this.selectedAreaUuids = this.initialAreas()));
      }
      if (this.config.selectAssetType) {
        this.loadAssetTypes();
      }
      if (this.config.tags) {
        this.loadTags();
      }
      if (this.config.selectLocation || this.config.selectParentLocation) {
        this.loadLocations();
      }
    });
  }

  /** Locations show the icon of their kind. */
  protected get headerIcon(): LucideIcon {
    return this.config.locationType
      ? locationTypeInfo(this.form.locationType).icon
      : this.config.icon;
  }

  protected get title(): string {
    return this.uuid ? this.config.editTitle : this.config.createTitle;
  }

  protected get canSave(): boolean {
    return this.uuid
      ? this.permissions.can(this.config.resourceType, 'edit', this.originalAreaUuids)
      : this.permissions.can(this.config.resourceType, 'create');
  }

  /** New objects need create rights in the area, existing ones edit rights. */
  private get areaAction(): 'create' | 'edit' {
    return this.uuid ? 'edit' : 'create';
  }

  protected get areaOptions(): SelectOption[] {
    return this.areaService.areas
      .filter((area) =>
        this.permissions.canInArea(this.config.resourceType, this.areaAction, area.uuid),
      )
      .map((area) => ({
        value: area.uuid,
        label: area.name,
        color: area.color,
        hint: area.defaultArea ? t('inventoryForm.defaultArea') : undefined,
      }));
  }

  protected get lockedAreaOptions(): SelectOption[] {
    return this.lockedAreaUuids.map((uuid) => ({
      value: uuid,
      label: this.areaService.name(uuid),
    }));
  }

  /** Preselect the areas from the sidebar filter, otherwise the default area. */
  private initialAreas(): string[] {
    const allowed = new Set(this.areaOptions.map((option) => option.value));
    const fromFilter = this.areaService.selected.filter((uuid) => allowed.has(uuid));
    if (fromFilter.length) {
      return fromFilter;
    }
    const defaultArea = this.areaService.defaultArea;
    if (defaultArea && allowed.has(defaultArea.uuid)) {
      return [defaultArea.uuid];
    }
    return this.areaOptions.slice(0, 1).map((option) => option.value);
  }

  /** Where "back" and "cancel" lead: the detail page when editing, otherwise the list. */
  protected get backRoute(): string[] {
    return this.uuid && this.config.detailRoutePrefix
      ? [this.config.detailRoutePrefix, this.uuid]
      : [this.config.listRoute];
  }

  /** `createAnother` keeps the context (areas, location, type, ...) and opens an empty form again. */
  protected save(createAnother = false): void {
    if (!this.canSave || this.saving || this.uploading || this.coordinatesError) {
      return;
    }
    if (!this.selectedAreaUuids.length && !this.lockedAreaUuids.length) {
      this.error = t('inventoryForm.errors.areaRequired');
      return;
    }
    this.saving = true;
    this.error = '';

    const request = this.normalizeRequest(this.form);
    const save$ = this.uuid
      ? this.api.update(this.config.endpoint, this.uuid, request)
      : this.api.create(this.config.endpoint, request);

    save$.subscribe({
      next: (saved) => {
        this.saving = false;
        if (createAnother && !this.uuid) {
          this.lastCreated = { uuid: saved.uuid, name: saved.name };
          this.prepareNext();
          return;
        }
        this.router.navigate(
          this.config.detailRoutePrefix
            ? [this.config.detailRoutePrefix, saved.uuid]
            : [this.config.listRoute],
        );
      },
      error: () => {
        this.saving = false;
        this.error = t('inventoryForm.errors.save');
      },
    });
  }

  /**
   * Clears what is specific to one entry (name, numbers, images, values) and keeps
   * what the next entry most likely shares: areas, location, type, tags, interval, address.
   */
  private prepareNext(): void {
    const previous = this.form;
    this.form = {
      ...this.emptyForm(),
      address: previous.address,
      locationType: previous.locationType,
      street: previous.street,
      postalCode: previous.postalCode,
      city: previous.city,
      country: previous.country,
      latitude: previous.latitude,
      longitude: previous.longitude,
      inspectionIntervalDays: previous.inspectionIntervalDays,
      assetTypeUuid: previous.assetTypeUuid,
      locationUuid: previous.locationUuid,
      parentLocationUuid: previous.parentLocationUuid,
      // types: the next type often has similar fields
      fieldDefinitions: (previous.fieldDefinitions ?? []).map((definition) => ({ ...definition })),
      // assets: keep the names of own custom fields, not their values
      fieldValues: (previous.fieldValues ?? [])
        .filter((field) => field.customAssetField)
        .map((field) => ({ ...field, value: '' })),
    };
    // rebuilds the (empty) fields of the selected type
    this.applySelectedAssetType(true);

    setTimeout(() => {
      this.host.nativeElement.querySelector('.form-page')?.scrollTo({ top: 0, behavior: 'smooth' });
      this.host.nativeElement.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    });
  }

  private load(uuid: string): void {
    this.loading = true;
    this.error = '';
    this.api.get<InventoryItem>(this.config.endpoint, uuid).subscribe({
      next: (item) => {
        this.form = {
          invId: item.invId ?? '',
          name: item.name,
          description: item.description ?? '',
          address: item.address ?? '',
          locationType: item.locationType ?? 'OTHER',
          street: item.street ?? '',
          postalCode: item.postalCode ?? '',
          city: item.city ?? '',
          country: item.country ?? '',
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
          color: item.color ?? '',
          serialNumber: item.serialNumber ?? '',
          inventoryNumber: item.inventoryNumber ?? '',
          inspectionIntervalDays: item.inspectionIntervalDays ?? null,
          assetTypeUuid: item.assetTypeUuid ?? null,
          locationUuid: item.locationUuid ?? null,
          parentLocationUuid: item.parentLocationUuid ?? null,
          parentAssetUuid: item.parentAssetUuid ?? null,
          parentAssetNote: item.parentAssetNote ?? '',
          inspectionPolicy: item.inspectionPolicy ?? 'STANDARD',
          statusUuid: item.status?.uuid ?? null,
          statusComment: '',
          fieldDefinitions: item.fieldDefinitions ?? [],
          fieldValues: item.fieldValues ?? [],
          images: item.images ?? [],
          tagUuids: [],
        };
        if (
          this.config.coordinates &&
          item.address &&
          !item.street &&
          !item.postalCode &&
          !item.city &&
          !item.country
        ) {
          this.legacyAddress = item.address;
          this.form.street = item.address;
        }
        this.selectedTagUuids = (item.tags ?? []).map((tag) => tag.uuid);
        this.originalStatusUuid = item.status?.uuid ?? null;
        this.originalAreaUuids = item.areaUuids ?? [];
        this.areaService.load().subscribe(() => {
          const editable = new Set(this.areaOptions.map((option) => option.value));
          this.selectedAreaUuids = this.originalAreaUuids.filter((uuid) => editable.has(uuid));
          this.lockedAreaUuids = this.originalAreaUuids.filter((uuid) => !editable.has(uuid));
        });
        this.applySelectedAssetType(false);
        this.loading = false;
      },
      error: () => {
        this.error = t('common.errors.load');
        this.loading = false;
      },
    });
  }

  private emptyForm(): InventoryRequest {
    return {
      invId: '',
      name: '',
      description: '',
      address: '',
      locationType: 'OTHER',
      street: '',
      postalCode: '',
      city: '',
      country: '',
      latitude: null,
      longitude: null,
      color: '',
      serialNumber: '',
      inventoryNumber: '',
      inspectionIntervalDays: null,
      assetTypeUuid: null,
      locationUuid: null,
      parentLocationUuid: null,
      parentAssetUuid: null,
      parentAssetNote: '',
      inspectionPolicy: 'STANDARD',
      fieldDefinitions: [],
      fieldValues: [],
      images: [],
      tagUuids: [],
    };
  }

  /** Statuses that fit the chosen areas (custom ones belong to one area); the current one always stays. */
  protected get statusOptions(): SelectOption[] {
    const areas = [...this.lockedAreaUuids, ...this.selectedAreaUuids];
    return this.statuses
      .filter((status) => statusFitsAreas(status, areas) || status.uuid === this.form.statusUuid)
      .map((status) => ({ value: status.uuid, label: statusName(status), color: status.color }));
  }

  protected get statusChanged(): boolean {
    return !!this.uuid && this.form.statusUuid !== this.originalStatusUuid;
  }

  /** New assets start as "Vorhanden". */
  private loadStatuses(): void {
    this.assetStatuses.list().subscribe({
      next: (statuses) => {
        this.statuses = statuses;
        if (!this.uuid && !this.form.statusUuid) {
          this.form.statusUuid = statuses.find((status) => status.systemKey === 'AVAILABLE')?.uuid ?? null;
        }
      },
      error: () => (this.statuses = []),
    });
  }

  private normalizeRequest(request: InventoryRequest): InventoryRequest {
    // assets: the status only goes along when it changed (or for a new asset), with its comment
    const status =
      this.config.endpoint === 'assets'
        ? {
            statusUuid: !this.uuid || this.statusChanged ? (request.statusUuid ?? null) : null,
            statusComment: this.statusChanged ? request.statusComment?.trim() || null : null,
          }
        : {};
    return {
      ...request,
      ...status,
      invId: request.invId || undefined,
      description: request.description || null,
      locationType: this.config.locationType ? (request.locationType ?? 'OTHER') : undefined,
      // locations: the backend formats the address from its parts
      address: this.config.coordinates ? null : request.address || null,
      street: this.config.coordinates ? request.street?.trim() || null : undefined,
      postalCode: this.config.coordinates ? request.postalCode?.trim() || null : undefined,
      city: this.config.coordinates ? request.city?.trim() || null : undefined,
      country: this.config.coordinates ? request.country?.trim() || null : undefined,
      latitude: this.config.coordinates ? (request.latitude ?? null) : undefined,
      longitude: this.config.coordinates ? (request.longitude ?? null) : undefined,
      color: request.color || null,
      serialNumber: request.serialNumber || null,
      inventoryNumber: request.inventoryNumber || null,
      inspectionIntervalDays: request.inspectionIntervalDays ?? null,
      assetTypeUuid: request.assetTypeUuid || null,
      locationUuid: request.locationUuid || null,
      parentLocationUuid: request.parentLocationUuid || null,
      parentAssetUuid: request.parentAssetUuid || null,
      parentAssetNote: request.parentAssetUuid ? request.parentAssetNote?.trim() || null : null,
      fieldDefinitions: request.fieldDefinitions ?? [],
      fieldValues: request.fieldValues ?? [],
      images: request.images?.filter((image) => image.fileUuid || image.url?.trim()) ?? [],
      tagUuids: this.config.tags ? this.selectedTagUuids : [],
      areaUuids: [...new Set([...this.lockedAreaUuids, ...this.selectedAreaUuids])],
    };
  }

  /** Coordinates must be both set or both empty and within the WGS 84 range. */
  protected get coordinatesError(): string {
    const { latitude, longitude } = this.form;
    if (!this.config.coordinates || (latitude == null && longitude == null)) return '';
    if (latitude == null || longitude == null)
      return t('inventoryForm.errors.coordinatesIncomplete');
    if (latitude < -90 || latitude > 90) return t('inventoryForm.errors.latitudeRange');
    if (longitude < -180 || longitude > 180) return t('inventoryForm.errors.longitudeRange');
    return '';
  }

  protected applyCoordinates(match: GeocodingResult): void {
    this.form.latitude = Number(match.latitude.toFixed(7));
    this.form.longitude = Number(match.longitude.toFixed(7));
  }

  protected applyAddress(match: GeocodingResult): void {
    this.form.street = match.street ?? '';
    this.form.postalCode = match.postalCode ?? '';
    this.form.city = match.city ?? '';
    this.form.country = match.country ?? '';
    this.legacyAddress = '';
  }

  protected get generalFields(): FieldConfig[] {
    return this.config.fields.filter((field) => field.key !== 'inspectionIntervalDays');
  }

  protected get inspectionFields(): FieldConfig[] {
    return this.config.fields.filter((field) => field.key === 'inspectionIntervalDays');
  }

  protected addCustomField(): void {
    if (this.config.resourceType === 'ASSET_TYPE') {
      this.form.fieldDefinitions = [
        ...(this.form.fieldDefinitions ?? []),
        {
          name: '',
          fieldKey: null,
          fieldType: 'TEXT',
          optionsJson: null,
          required: false,
          typeField: true,
          sortOrder: this.form.fieldDefinitions?.length ?? 0,
        },
      ];
      return;
    }

    this.form.fieldValues = [
      ...(this.form.fieldValues ?? []),
      {
        name: '',
        fieldKey: null,
        value: '',
        customAssetField: true,
      },
    ];
  }

  protected removeCustomField(index: number): void {
    if (this.config.resourceType === 'ASSET_TYPE') {
      this.form.fieldDefinitions = (this.form.fieldDefinitions ?? []).filter(
        (_, fieldIndex) => fieldIndex !== index,
      );
      return;
    }

    this.form.fieldValues = (this.form.fieldValues ?? []).filter(
      (_, fieldIndex) => fieldIndex !== index,
    );
  }

  protected get locationOptions(): SelectOption[] {
    const excluded =
      this.config.selectParentLocation && this.uuid
        ? locationWithDescendants(this.locations, this.uuid)
        : new Set<string>();
    return this.locations
      .filter((location) => !excluded.has(location.uuid))
      .map((location) => ({
        value: location.uuid,
        label: locationPath(this.locations, location),
        hint: location.address ?? undefined,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get parentAssetOptions(): SelectOption[] {
    const byUuid = new Map(this.assets.map((asset) => [asset.uuid, asset]));
    return this.assets
      .filter((asset) => {
        const visited = new Set<string>();
        let current: InventoryItem | undefined = asset;
        while (current) {
          if (current.uuid === this.uuid || visited.has(current.uuid)) return false;
          visited.add(current.uuid);
          current = current.parentAssetUuid ? byUuid.get(current.parentAssetUuid) : undefined;
        }
        return true;
      })
      .map((asset) => ({ value: asset.uuid, label: asset.name, hint: asset.invId ?? undefined }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get assetTypeOptions(): SelectOption[] {
    return this.assetTypes.map((type) => ({
      value: type.uuid,
      label: type.name,
      hint: type.description ?? undefined,
    }));
  }

  protected get tagOptions(): SelectOption[] {
    return this.tags.map((tag) => ({ value: tag.uuid, label: tag.name, color: tag.color }));
  }

  protected get lockedTagOptions(): SelectOption[] {
    return this.lockedTags.map((tag) => ({ value: tag.uuid, label: tag.name, color: tag.color }));
  }

  protected createTag(name: string): void {
    // a tag created while typing gets a color of its own instead of none
    this.api.create<TagItem>('tags', { name, color: randomPresetColor() }).subscribe({
      next: (tag) => {
        this.tags = [...this.tags, tag].sort((a, b) => a.name.localeCompare(b.name));
        this.selectedTagUuids = [...this.selectedTagUuids, tag.uuid];
      },
      error: () => {
        this.error = t('inventoryForm.errors.createTag');
      },
    });
  }

  protected selectAssetType(assetTypeUuid: string | null): void {
    this.form.assetTypeUuid = assetTypeUuid;
    this.applySelectedAssetType(true);
  }

  private applySelectedAssetType(resetFields: boolean): void {
    if (!this.config.selectAssetType) {
      return;
    }

    const assetTypeUuid = this.form.assetTypeUuid ?? null;
    const assetType = this.assetTypes.find((type) => type.uuid === assetTypeUuid);
    const customFields = (this.form.fieldValues ?? []).filter((field) => field.customAssetField);
    if (!assetType) {
      this.form.fieldValues = customFields;
      this.lockedTags = [];
      return;
    }

    this.form.inspectionIntervalDays =
      assetType.inspectionIntervalDays ?? this.form.inspectionIntervalDays;
    this.lockedTags = assetType.tags ?? [];
    const lockedUuids = new Set(this.lockedTags.map((tag) => tag.uuid));
    this.selectedTagUuids = this.selectedTagUuids.filter((uuid) => !lockedUuids.has(uuid));

    const currentValues = new Map(
      (this.form.fieldValues ?? [])
        .filter((field) => !field.customAssetField)
        .map((field) => [field.fieldKey ?? field.name, field.value ?? '']),
    );

    this.form.fieldValues = [
      ...(assetType.fieldDefinitions ?? []).map((definition) => ({
        fieldKey: definition.fieldKey,
        name: definition.name,
        value: resetFields ? '' : (currentValues.get(definition.fieldKey ?? definition.name) ?? ''),
        customAssetField: false,
      })),
      ...customFields,
    ];
  }

  private loadAssetTypes(): void {
    this.api.list<InventoryItem>('asset-types').subscribe({
      next: (types) => {
        this.assetTypes = types;
        this.applySelectedAssetType(false);
      },
      error: () => {
        this.error = t('inventoryForm.errors.loadAssetTypes');
      },
    });
  }

  private loadLocations(): void {
    this.api.list<InventoryItem>('locations').subscribe({
      next: (locations) => {
        this.locations = locations;
      },
      error: () => {
        this.error = t('inventoryForm.errors.loadLocations');
      },
    });
  }

  private loadTags(): void {
    this.api.list<TagItem>('tags').subscribe({
      next: (tags) => {
        this.tags = tags.sort((a, b) => a.name.localeCompare(b.name));
      },
      error: () => {
        this.error = t('inventoryForm.errors.loadTags');
      },
    });
  }
}
