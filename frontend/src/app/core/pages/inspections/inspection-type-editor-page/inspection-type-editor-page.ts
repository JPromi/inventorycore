import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowDown,
  LucideArrowLeft,
  LucideArrowUp,
  LucideClipboardList,
  LucidePlus,
  LucideSave,
  LucideShapes,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { forkJoin, of } from 'rxjs';

import { ColorPicker } from '../../../components/color-picker/color-picker';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import { AssetFieldType, InventoryApiService, InventoryItem } from '../../../service/inventory-api.service';
import { CHECK_FIELD_TYPES, InspectionField, InspectionService, fieldOptions } from '../../../service/inspection.service';

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
    SearchSelect,
    LucideArrowDown,
    LucideArrowLeft,
    LucideArrowUp,
    LucideClipboardList,
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
  ) {}

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    this.loading = true;
    forkJoin({
      assetTypes: this.inventory.list<InventoryItem>('asset-types'),
      type: this.uuid ? this.api.type(this.uuid) : of(null),
    }).subscribe({
      next: ({ assetTypes, type }) => {
        this.assetTypes = assetTypes.sort((a, b) => a.name.localeCompare(b.name));
        if (type) {
          this.name = type.name;
          this.description = type.description ?? '';
          this.color = type.color ?? null;
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

    const request = { name: this.name.trim(), description: this.description.trim() || null, color: this.color, fields };
    this.saving = true;
    this.error = '';
    const save$ = this.uuid ? this.api.updateType(this.uuid, request) : this.api.createType(request);
    save$.subscribe({
      next: () => this.router.navigate(['/config/inspection-types']),
      error: () => {
        this.saving = false;
        this.error = 'Speichern fehlgeschlagen.';
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
