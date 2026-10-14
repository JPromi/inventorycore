import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowDown,
  LucideArrowLeft,
  LucideArrowUp,
  LucideClipboardList,
  LucideListChecks,
  LucidePackageSearch,
  LucideRepeat,
  LucidePlus,
  LucideSave,
  LucideShapes,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { forkJoin, of } from 'rxjs';

import { ColorPicker } from '../../../components/color-picker/color-picker';
import { MultiSelect } from '../../../components/multi-select/multi-select';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import { AreaItem, AreaService } from '../../../service/area.service';
import { AssetFieldType, InventoryApiService, InventoryItem } from '../../../service/inventory-api.service';
import {
  CHECK_FIELD_TYPES,
  INTERVAL_UNITS,
  InspectionField,
  InspectionMode,
  InspectionService,
  IntervalUnit,
  fieldOptions,
  intervalText,
} from '../../../service/inspection.service';

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
    LucideArrowDown,
    LucideArrowLeft,
    LucideArrowUp,
    LucideClipboardList,
    LucideListChecks,
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
  protected intervalValue = 6;
  protected intervalUnit: IntervalUnit = 'WEEKS';
  /** Asset types the inspection is for; empty = all assets. */
  protected assetTypeUuids: string[] = [];
  /** empty = all areas */
  protected areaUuids: string[] = [];
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
      areas: this.areaService.load(),
      type: this.uuid ? this.api.type(this.uuid) : of(null),
    }).subscribe({
      next: ({ assetTypes, areas, type }) => {
        this.areas = [...areas].sort((a, b) => a.name.localeCompare(b.name));
        this.assetTypes = assetTypes.sort((a, b) => a.name.localeCompare(b.name));
        if (type) {
          this.name = type.name;
          this.description = type.description ?? '';
          this.color = type.color ?? null;
          this.mode = type.mode ?? 'INVENTORY';
          this.recurring = !!type.intervalValue && !!type.intervalUnit;
          this.intervalValue = type.intervalValue ?? 6;
          this.intervalUnit = type.intervalUnit ?? 'WEEKS';
          this.assetTypeUuids = [...(type.assetTypeUuids ?? [])];
          this.areaUuids = [...(type.areaUuids ?? [])];
          this.groups = this.toGroups(type.fields);
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Daten konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  protected get title(): string {
    return this.uuid ? 'Prüfungsart bearbeiten' : 'Neue Prüfungsart';
  }

  protected get areaOptions(): SelectOption[] {
    return this.areas.map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
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
    return this.assetTypes.filter((type) => !used.has(type.uuid)).map((type) => ({ value: type.uuid, label: type.name }));
  }

  protected typeName(uuid: string | null): string {
    return this.assetTypes.find((type) => type.uuid === uuid)?.name ?? 'Unbekannter Typ';
  }

  protected addField(group: FieldGroup): void {
    group.fields.push({ uuid: null, name: '', fieldType: 'BOOLEAN', required: false, optionsText: '' });
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
      this.error = 'Bitte einen Namen angeben.';
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
          optionsJson: field.fieldType === 'SELECT' ? JSON.stringify(this.splitOptions(field.optionsText)) : null,
          required: field.required,
          sortOrder: 0,
        })),
    );
    const invalidSelect = fields.find((field) => field.fieldType === 'SELECT' && !fieldOptions(field).length);
    if (invalidSelect) {
      this.error = `Das Auswahlfeld „${invalidSelect.name}“ braucht mindestens eine Option.`;
      return;
    }
    fields.forEach((field, index) => (field.sortOrder = index));

    if (this.recurring && (!this.intervalValue || this.intervalValue < 1)) {
      this.error = 'Bitte ein Intervall von mindestens 1 angeben.';
      return;
    }
    const request = {
      name: this.name.trim(),
      description: this.description.trim() || null,
      color: this.color,
      mode: this.mode,
      intervalValue: this.recurring ? Math.round(this.intervalValue) : null,
      intervalUnit: this.recurring ? this.intervalUnit : null,
      assetTypeUuids: this.assetTypeUuids,
      areaUuids: this.areaUuids,
      fields,
    };
    this.saving = true;
    this.error = '';
    const save$ = this.uuid ? this.api.updateType(this.uuid, request) : this.api.createType(request);
    save$.subscribe({
      next: () => this.router.navigate(['/config/inspection-types']),
      error: (error) => {
        this.saving = false;
        this.error = error?.error?.message ?? 'Speichern fehlgeschlagen.';
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

  private splitOptions(text: string): string[] {
    return [...new Set(text.split(/[,;\n]/).map((option) => option.trim()).filter(Boolean))];
  }
}
