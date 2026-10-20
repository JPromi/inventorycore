import { CommonModule } from '@angular/common';
import { ImageViewerService } from '../../../../shared/components/image-viewer/image-viewer.service';
import { Component, DestroyRef, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DetailConfig, DetailField } from './detail-configs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideBoxes,
  LucideCalendarClock,
  LucideChevronRight,
  LucideFileText,
  LucideMapPin,
  LucidePencil,
  LucidePlus,
  LucidePrinter,
  LucideShapes,
  LucideTrash2,
  type LucideIcon,
} from '@lucide/angular';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { LabelPrintDialog } from '../../../labels/label-print-dialog/label-print-dialog';
import { AssetInspectionList } from '../../../../shared/components/asset-inspection-list/asset-inspection-list';
import { AuditHistory } from '../../../../shared/components/audit-history/audit-history';
import { LocationMap } from '../../../../shared/components/location-map/location-map';
import { AssetPrint, AssetPrintDetail } from './asset-print/asset-print';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AreaService } from '../../../../core/service/area.service';
import {
  AssetInspection,
  InspectionDue,
  InspectionService,
  dueText,
  formatCheckValue,
  intervalText,
} from '../../../inspections/data-access/inspection.service';
import {
  AssetFieldType,
  ASSET_INSPECTION_POLICIES,
  CustomFieldDefinition,
  InventoryApiService,
  InventoryImage,
  InventoryItem,
  TagItem,
} from '../../data-access/inventory-api.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { locationPath, locationWithDescendants } from '../../../../shared/util/location-utils';
import { locationTypeInfo, LocationTypeInfo } from '../../../../shared/util/location-types';

interface LinkedItem {
  uuid: string;
  name: string;
  hint?: string;
}

const FIELD_TYPE_LABELS: Record<string, string | undefined> = {
  TEXT: t('inventoryDetail.fieldTypes.TEXT'),
  NUMBER: t('inventoryDetail.fieldTypes.NUMBER'),
  BOOLEAN: t('inventoryDetail.fieldTypes.BOOLEAN'),
  DATE: t('inventoryDetail.fieldTypes.DATE'),
  DATETIME: t('inventoryDetail.fieldTypes.DATETIME'),
  URL: t('inventoryDetail.fieldTypes.URL'),
  EMAIL: t('inventoryDetail.fieldTypes.EMAIL'),
  SELECT: t('inventoryDetail.fieldTypes.SELECT'),
};

@Component({
  selector: 'app-inventory-detail-page',
  imports: [
    AssetInspectionList,
    AssetPrint,
    AuditHistory,
    CommonModule,
    FormsModule,
    RouterLink,
    LabelPrintDialog,
    LocationMap,
    LucideArrowLeft,
    LucideBoxes,
    LucideCalendarClock,
    LucideChevronRight,
    LucideFileText,
    LucideMapPin,
    LucidePencil,
    LucidePlus,
    LucidePrinter,
    LucideShapes,
    LucideTrash2,
    TranslatePipe,
  ],
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
  protected images: InventoryImage[] = [];
  private loadSubscription?: Subscription;
  protected locations: InventoryItem[] = [];
  protected assetTypes: InventoryItem[] = [];
  protected assets: InventoryItem[] = [];
  protected showPrintDialog = false;
  protected inspections: AssetInspection[] = [];
  /** Recurring inspections of this asset with their due dates. */
  protected schedules: InspectionDue[] = [];
  protected editingSchedule: string | null = null;
  protected fixedDateInput = '';
  protected readonly dueText = dueText;
  protected readonly intervalText = intervalText;

  @ViewChild(AssetPrint) private assetPrint?: AssetPrint;

  constructor(
    private readonly destroyRef: DestroyRef,
    protected readonly imageViewer: ImageViewerService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InventoryApiService,
    private readonly confirmDialog: ConfirmDialogService,
    protected readonly permissions: PermissionService,
    private readonly areaService: AreaService,
    private readonly inspectionService: InspectionService,
  ) {}

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.config = data['inventoryDetailConfig'];
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const uuid = params.get('uuid');
      if (uuid) {
        this.load(uuid);
      }
    });
  }

  /** Inspection history is shown on assets to users who may inspect. */
  protected get canSeeInspections(): boolean {
    return this.config.endpoint === 'assets' && this.permissions.can('ASSET', 'inspect');
  }

  /** Fixed dates may be set by whoever may inspect or edit the asset. */
  protected get canPlanInspections(): boolean {
    const areas = this.item?.areaUuids ?? [];
    return (
      this.permissions.can('ASSET', 'inspect', areas) ||
      this.permissions.can('ASSET', 'edit', areas)
    );
  }

  protected editSchedule(entry: InspectionDue): void {
    this.editingSchedule = entry.inspectionTypeUuid;
    this.fixedDateInput = entry.fixedDueDate ?? entry.nextDueDate;
  }

  /** `null` removes the fixed date, so the interval counts again. */
  protected saveFixedDate(entry: InspectionDue, date: string | null): void {
    if (!this.item) {
      return;
    }
    this.inspectionService
      .setFixedDueDate(this.item.uuid, entry.inspectionTypeUuid, date || null)
      .subscribe({
        next: (updated) => {
          this.schedules = this.schedules.map((schedule) =>
            schedule.inspectionTypeUuid === updated.inspectionTypeUuid ? updated : schedule,
          );
          this.editingSchedule = null;
        },
        error: () => (this.error = t('inventoryDetail.errors.saveSchedule')),
      });
  }

  /** Locations show the icon and name of their kind. */
  protected get locationType(): LocationTypeInfo | null {
    return this.config.endpoint === 'locations' && this.item
      ? locationTypeInfo(this.item.locationType)
      : null;
  }

  protected get icon(): LucideIcon {
    return this.locationType?.icon ?? this.config.icon;
  }

  protected get canEdit(): boolean {
    return (
      !!this.item &&
      !!this.config.editRoutePrefix &&
      this.permissions.can(this.config.resourceType, 'edit', this.item.areaUuids ?? [])
    );
  }

  protected get canDelete(): boolean {
    return (
      !!this.item &&
      this.permissions.can(this.config.resourceType, 'delete', this.item.areaUuids ?? [])
    );
  }

  protected get assetType(): InventoryItem | null {
    return this.assetTypes.find((type) => type.uuid === this.item?.assetTypeUuid) ?? null;
  }

  protected get parentAsset(): InventoryItem | null {
    return this.assets.find((asset) => asset.uuid === this.item?.parentAssetUuid) ?? null;
  }

  protected get childAssets(): InventoryItem[] {
    return this.assets
      .filter((asset) => asset.parentAssetUuid === this.item?.uuid)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Location chain from the root down, used as breadcrumb. */
  protected get locationChain(): InventoryItem[] {
    const startUuid =
      this.config.endpoint === 'locations'
        ? this.item?.parentLocationUuid
        : this.item?.locationUuid;
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
      return { name: area?.name ?? t('inventoryDetail.areaWithoutAccess'), color: area?.color };
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
      .map((location) => ({
        uuid: location.uuid,
        name: location.name,
        hint: location.address ?? undefined,
      }))
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

  /**
   * Custom fields of an asset: the fields defined by its type (in their order, also when empty),
   * then the asset's own extra fields.
   */
  protected get customFields(): {
    name: string;
    value: string | null;
    fieldType: AssetFieldType | null;
  }[] {
    if (this.config.endpoint !== 'assets' || !this.item) {
      return [];
    }
    const values = [...(this.item.fieldValues ?? [])];
    const take = (definition: CustomFieldDefinition) => {
      const index = values.findIndex((value) =>
        definition.fieldKey && value.fieldKey
          ? value.fieldKey === definition.fieldKey
          : value.name === definition.name,
      );
      return index >= 0 ? values.splice(index, 1)[0] : null;
    };
    const definitions = [...(this.assetType?.fieldDefinitions ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const fromType = definitions.map((definition) => ({
      name: definition.name,
      value: take(definition)?.value || null,
      fieldType: definition.fieldType,
    }));
    const own = values.map((value) => ({
      name: value.name,
      value: value.value || null,
      fieldType: null,
    }));
    return [...fromType, ...own];
  }

  /** Details for the printed data sheet; inventory ID, type and location are in its header. */
  protected get printDetails(): AssetPrintDetail[] {
    const fields = this.config.fields
      .filter((field) => field.key !== 'invId')
      .map((field) => ({
        label: field.label,
        value: this.fieldValue(field),
        wide: field.key === 'description',
      }));
    const custom = this.customFields.map((field) => ({
      label: field.name,
      value: field.value ? this.formatCustomValue(field.value, field.fieldType) : null,
    }));
    const tags = [...this.ownTags, ...this.inheritedTags].map((tag) => tag.name).join(', ');
    return [...fields, ...custom, { label: t('terms.tags'), value: tags, wide: true }].filter(
      (detail): detail is AssetPrintDetail => !!detail.value,
    );
  }

  protected get locationText(): string | null {
    return this.locationChain.map((location) => location.name).join(' / ') || null;
  }

  protected get areaNames(): string[] {
    return this.areas.map((area) => area.name);
  }

  protected printSheet(): void {
    this.assetPrint?.open();
  }

  protected formatCustomValue(value: string | null, fieldType: AssetFieldType | null): string {
    return formatCheckValue(value, fieldType);
  }

  protected fieldValue(field: DetailField): string | null {
    if (field.key === 'inspectionPolicy')
      return ASSET_INSPECTION_POLICIES[this.item?.inspectionPolicy ?? 'STANDARD'];
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
      error: (error) => {
        this.error =
          this.config.endpoint === 'assets' && error.status === 409
            ? t('inventoryDetail.errors.hasChildren')
            : t('common.errors.delete');
      },
    });
  }

  private assetHint(asset: InventoryItem): string {
    if (this.config.endpoint === 'locations' && asset.locationUuid !== this.item?.uuid) {
      const location = this.locations.find((entry) => entry.uuid === asset.locationUuid);
      return [asset.invId, location ? locationPath(this.locations, location) : null]
        .filter(Boolean)
        .join(' · ');
    }
    return asset.invId ?? '';
  }

  private load(uuid: string): void {
    this.loadSubscription?.unsubscribe();
    this.editingSchedule = null;
    this.fixedDateInput = '';
    this.images = [];
    this.activeImage = null;
    this.loading = true;
    this.error = '';
    this.item = null;

    const needsAssets = this.config.endpoint === 'assets' || this.permissions.can('ASSET', 'view');
    const optional = <T>(endpoint: string, wanted: boolean) =>
      wanted
        ? this.api.list<InventoryItem>(endpoint).pipe(catchError(() => of([] as T[])))
        : of([] as T[]);

    this.loadSubscription = forkJoin({
      item: this.api.get<InventoryItem>(this.config.endpoint, uuid),
      areas: this.areaService.load(),
      locations: optional<InventoryItem>('locations', this.permissions.can('LOCATION', 'view')),
      assetTypes: optional<InventoryItem>('asset-types', this.config.endpoint === 'assets'),
      assets: optional<InventoryItem>('assets', needsAssets),
      schedules:
        this.config.endpoint === 'assets'
          ? this.inspectionService
              .schedulesOfAsset(uuid)
              .pipe(catchError(() => of([] as InspectionDue[])))
          : of([] as InspectionDue[]),
      inspections: this.canSeeInspections
        ? this.inspectionService
            .inspectionsOfAsset(uuid)
            .pipe(catchError(() => of([] as AssetInspection[])))
        : of([] as AssetInspection[]),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ item, locations, assetTypes, assets, inspections, schedules }) => {
          this.item = item;
          this.inspections = inspections;
          this.schedules = schedules;
          this.locations = locations;
          this.assetTypes = assetTypes;
          this.assets = assets;
          this.images = [...(item.images ?? [])].sort((a, b) =>
            a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind === 'THUMBNAIL' ? -1 : 1,
          );
          this.activeImage = this.images[0] ?? null;
          this.loading = false;
        },
        error: () => {
          this.error = t('inventoryDetail.errors.load');
          this.loading = false;
        },
      });
  }
}
