import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowDown,
  LucideArrowLeft,
  LucideArrowUp,
  LucideClipboardList,
  LucideListChecks,
  LucideListFilter,
  LucidePackageSearch,
  LucideRepeat,
  LucidePlus,
  LucideSave,
  LucideShapes,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { forkJoin, of } from 'rxjs';

import { ColorPicker } from '../../../../shared/components/color-picker/color-picker';
import { MultiSelect } from '../../../../shared/components/multi-select/multi-select';
import {
  SearchSelect,
  SelectOption,
} from '../../../../shared/components/search-select/search-select';
import { AreaItem, AreaService } from '../../../../core/service/area.service';
import { locationPath } from '../../../../shared/util/location-utils';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import {
  AssetFieldType,
  InventoryApiService,
  InventoryItem,
  TagItem,
} from '../../../inventory/data-access/inventory-api.service';
import {
  CHECK_FIELD_TYPES,
  INTERVAL_UNITS,
  InspectionField,
  InspectionMode,
  InspectionService,
  IntervalUnit,
  fieldOptions,
  parseOptions,
  intervalText,
} from '../../data-access/inspection.service';

interface EditableField {
  uuid: string | null;
  name: string;
  fieldType: AssetFieldType;
  required: boolean;
  /** SELECT choices, comma separated while editing */
  optionsText: string;
}

interface FieldGroup {
  /** null = fields for every asset */
  assetTypeUuid: string | null;
  fields: EditableField[];
}

@Component({
  selector: 'app-inspection-type-editor-page',
  imports: [
    FormsModule,
    RouterLink,
    ColorPicker,
    MultiSelect,
    SearchSelect,
    TranslatePipe,
    LucideArrowDown,
    LucideArrowLeft,
    LucideArrowUp,
    LucideClipboardList,
    LucideListChecks,
    LucideListFilter,
    LucidePackageSearch,
    LucideRepeat,
    LucidePlus,
    LucideSave,
    LucideShapes,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './inspection-type-editor-page.html',
  styleUrl: './inspection-type-editor-page.scss',
})
export class InspectionTypeEditorPage implements OnInit {
  protected readonly fieldTypes = CHECK_FIELD_TYPES;
  protected readonly intervalUnits = INTERVAL_UNITS;
  protected mode: InspectionMode = 'INVENTORY';
  protected recurring = false;
  protected defaultTagUuids: string[] = [];
  protected defaultAssetTypeUuids: string[] = [];
  protected defaultLocationUuids: string[] = [];
  protected recurringTagUuids: string[] = [];
  protected locations: InventoryItem[] = [];
  protected includeChildAssets = false;
  protected tags: TagItem[] = [];
  /** inventory: also in order / defect */
  protected checkFunction = false;
  protected intervalValue = 6;
  protected intervalUnit: IntervalUnit = 'WEEKS';
  /** Asset types the inspection is for; empty = all assets. */
  protected assetTypeUuids: string[] = [];
  /** empty = all areas */
  protected areaUuids: string[] = [];
  protected protocolAreaUuid: string | null = null;
  protected areas: AreaItem[] = [];
  protected uuid: string | null = null;
  protected name = '';
  protected description = '';
  protected color: string | null = '#2563eb';
  protected groups: FieldGroup[] = [{ assetTypeUuid: null, fields: [] }];
  protected assetTypes: InventoryItem[] = [];
  protected typeToAdd: string | null = null;
  protected loading = false;
  protected saving = false;
  protected error = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InspectionService,
    private readonly inventory: InventoryApiService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    this.loading = true;
    forkJoin({
      assetTypes: this.inventory.list<InventoryItem>('asset-types'),
      tags: this.inventory.list<TagItem>('tags'),
      locations: this.inventory.list<InventoryItem>('locations'),
      areas: this.areaService.load(),
      type: this.uuid ? this.api.type(this.uuid) : of(null),
    }).subscribe({
      next: ({ assetTypes, areas, tags, locations, type }) => {
        this.locations = locations;
        this.tags = tags;
        this.areas = [...areas].sort((a, b) => a.name.localeCompare(b.name));
        this.assetTypes = assetTypes.sort((a, b) => a.name.localeCompare(b.name));
        if (type) {
          this.name = type.name;
          this.defaultTagUuids = [...(type.defaultTagUuids ?? [])];
          this.defaultAssetTypeUuids = [...(type.defaultAssetTypeUuids ?? [])];
          this.defaultLocationUuids = [...(type.defaultLocationUuids ?? [])];
          this.recurringTagUuids = [...(type.recurringTagUuids ?? [])];
          this.includeChildAssets = !!type.includeChildAssets;
          this.description = type.description ?? '';
          this.color = type.color ?? null;
          this.mode = type.mode ?? 'INVENTORY';
          this.recurring = !!type.intervalValue && !!type.intervalUnit;
          this.checkFunction = !!type.checkFunction;
          this.intervalValue = type.intervalValue ?? 6;
          this.intervalUnit = type.intervalUnit ?? 'WEEKS';
          this.assetTypeUuids = [...(type.assetTypeUuids ?? [])];
          this.areaUuids = [...(type.areaUuids ?? [])];
          this.protocolAreaUuid = type.protocolAreaUuid ?? null;
          this.groups = this.toGroups(type.fields);
        } else {
          this.protocolAreaUuid =
            this.areaService.selected.find((uuid) => areas.some((area) => area.uuid === uuid)) ??
            areas.find((area) => area.defaultArea)?.uuid ??
            areas[0]?.uuid ??
            null;
        }
        this.loading = false;
      },
      error: () => {
        this.error = t('common.errors.load');
        this.loading = false;
      },
    });
  }

  protected get title(): string {
    return this.uuid
      ? t('inspectionTemplateEditor.titleEdit')
      : t('inspectionTemplateEditor.titleNew');
  }

  protected get areaOptions(): SelectOption[] {
    return this.areas.map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
  }

  protected get tagOptions(): SelectOption[] {
    return this.tags
      .map((tag) => ({ value: tag.uuid, label: tag.name, color: tag.color }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get locationOptions(): SelectOption[] {
    return this.locations
      .map((location) => ({ value: location.uuid, label: locationPath(this.locations, location) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get allTypeOptions(): SelectOption[] {
    return this.assetTypes.map((type) => ({ value: type.uuid, label: type.name }));
  }

  protected get intervalPreview(): string {
    return intervalText(this.intervalValue, this.intervalUnit);
  }

  /** Asset types that have no group yet. */
  protected get typeOptions(): SelectOption[] {
    const used = new Set(this.groups.map((group) => group.assetTypeUuid));
    return this.assetTypes
      .filter((type) => !used.has(type.uuid))
      .map((type) => ({ value: type.uuid, label: type.name }));
  }

  protected typeName(uuid: string | null): string {
    return (
      this.assetTypes.find((type) => type.uuid === uuid)?.name ??
      t('inspectionTemplateEditor.unknownType')
    );
  }

  protected addField(group: FieldGroup): void {
    group.fields.push({
      uuid: null,
      name: '',
      fieldType: 'BOOLEAN',
      required: false,
      optionsText: '',
    });
  }

  protected removeField(group: FieldGroup, index: number): void {
    group.fields.splice(index, 1);
  }

  protected moveField(group: FieldGroup, index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target >= 0 && target < group.fields.length) {
      [group.fields[index], group.fields[target]] = [group.fields[target], group.fields[index]];
    }
  }

  protected addTypeGroup(uuid: string | null): void {
    if (!uuid) {
      return;
    }
    const group: FieldGroup = { assetTypeUuid: uuid, fields: [] };
    this.addField(group);
    this.groups.push(group);
    // reset the select after the value was taken
    setTimeout(() => (this.typeToAdd = null));
  }

  protected removeGroup(group: FieldGroup): void {
    this.groups = this.groups.filter((entry) => entry !== group);
  }

  protected save(): void {
    if (!this.name.trim()) {
      this.error = t('inspectionTemplateEditor.errors.nameRequired');
      return;
    }
    const fields: InspectionField[] = this.groups.flatMap((group) =>
      group.fields
        .filter((field) => field.name.trim())
        .map((field) => ({
          uuid: field.uuid,
          assetTypeUuid: group.assetTypeUuid,
          name: field.name.trim(),
          fieldType: field.fieldType,
          optionsJson:
            field.fieldType === 'SELECT'
              ? JSON.stringify(parseOptions(field.optionsText))
              : null,
          required: field.required,
          sortOrder: 0,
        })),
    );
    const invalidSelect = fields.find(
      (field) => field.fieldType === 'SELECT' && !fieldOptions(field).length,
    );
    if (invalidSelect) {
      this.error = t('inspectionTemplateEditor.errors.selectWithoutOptions', {
        name: invalidSelect.name,
      });
      return;
    }
    fields.forEach((field, index) => (field.sortOrder = index));

    if (this.recurring && (!this.intervalValue || this.intervalValue < 1)) {
      this.error = t('inspectionTemplateEditor.errors.intervalMin');
      return;
    }
    const request = {
      name: this.name.trim(),
      defaultTagUuids: this.defaultTagUuids,
      defaultAssetTypeUuids: this.defaultAssetTypeUuids,
      defaultLocationUuids: this.defaultLocationUuids,
      recurringTagUuids: this.recurringTagUuids,
      includeChildAssets: this.includeChildAssets,
      description: this.description.trim() || null,
      color: this.color,
      mode: this.mode,
      checkFunction: this.mode === 'INVENTORY' && this.checkFunction,
      intervalValue: this.recurring ? Math.round(this.intervalValue) : null,
      intervalUnit: this.recurring ? this.intervalUnit : null,
      assetTypeUuids: this.assetTypeUuids,
      areaUuids: this.areaUuids,
      protocolAreaUuid: this.protocolAreaUuid,
      fields,
    };
    this.saving = true;
    this.error = '';
    const save$ = this.uuid
      ? this.api.updateType(this.uuid, request)
      : this.api.createType(request);
    save$.subscribe({
      next: () => this.router.navigate(['/config/inspection-templates']),
      error: (error) => {
        this.saving = false;
        this.error = error?.error?.message ?? t('common.errors.save');
      },
    });
  }

  private toGroups(fields: InspectionField[]): FieldGroup[] {
    const groups: FieldGroup[] = [{ assetTypeUuid: null, fields: [] }];
    for (const field of [...fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
      let group = groups.find((entry) => entry.assetTypeUuid === field.assetTypeUuid);
      if (!group) {
        group = { assetTypeUuid: field.assetTypeUuid, fields: [] };
        groups.push(group);
      }
      group.fields.push({
        uuid: field.uuid ?? null,
        name: field.name,
        fieldType: field.fieldType,
        required: field.required,
        optionsText: fieldOptions(field).join(', '),
      });
    }
    return groups;
  }

}
