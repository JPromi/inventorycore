import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideImagePlus, LucidePlus, LucideSave, LucideTrash2, type LucideIcon } from '@lucide/angular';

import { PermissionResourceType } from '../../entities/user.entity';
import { InventoryApiService, InventoryItem, InventoryRequest } from '../../service/inventory-api.service';
import { PermissionService } from '../../service/permission.service';

interface FormConfig {
  title: string;
  endpoint: string;
  listRoute: string;
  resourceType: PermissionResourceType;
  icon: LucideIcon;
  fields: FieldConfig[];
  customFields?: boolean;
  images?: boolean;
  autoInvId?: boolean;
  selectAssetType?: boolean;
}

interface FieldConfig {
  key: keyof InventoryRequest;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'color';
  required?: boolean;
}

@Component({
  selector: 'app-inventory-form-page',
  imports: [CommonModule, FormsModule, RouterLink, LucideArrowLeft, LucideImagePlus, LucidePlus, LucideSave, LucideTrash2],
  templateUrl: './inventory-form-page.html',
  styleUrl: './inventory-form-page.scss',
})
export class InventoryFormPage implements OnInit {
  protected readonly iconInputs = { size: 20 };
  protected config!: FormConfig;
  protected uuid: string | null = null;
  protected loading = false;
  protected error = '';
  protected form: InventoryRequest = this.emptyForm();
  protected assetTypes: InventoryItem[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InventoryApiService,
    protected readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.config = data['inventoryFormConfig'];
      this.uuid = this.route.snapshot.paramMap.get('uuid');
      this.form = this.emptyForm();

      if (this.uuid) {
        this.load(this.uuid);
      }
      if (this.config.selectAssetType) {
        this.loadAssetTypes();
      }
    });
  }

  protected get title(): string {
    return this.uuid ? `${this.config.title} bearbeiten` : `${this.config.title} erstellen`;
  }

  protected get canSave(): boolean {
    return this.uuid
      ? this.permissions.can(this.config.resourceType, 'edit', this.uuid)
      : this.permissions.can(this.config.resourceType, 'create');
  }

  protected save(): void {
    if (!this.canSave) {
      return;
    }

    const request = this.normalizeRequest(this.form);
    const save$ = this.uuid
      ? this.api.update(this.config.endpoint, this.uuid, request)
      : this.api.create(this.config.endpoint, request);

    save$.subscribe({
      next: () => this.router.navigate([this.config.listRoute]),
      error: () => {
        this.error = 'Speichern fehlgeschlagen.';
      },
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
          color: item.color ?? '',
          serialNumber: item.serialNumber ?? '',
          inventoryNumber: item.inventoryNumber ?? '',
          inspectionIntervalDays: item.inspectionIntervalDays ?? null,
          assetTypeUuid: item.assetTypeUuid ?? null,
          fieldDefinitions: item.fieldDefinitions ?? [],
          fieldValues: item.fieldValues ?? [],
          images: item.images ?? [],
        };
        this.loading = false;
      },
      error: () => {
        this.error = 'Eintrag konnte nicht geladen werden.';
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
      color: '',
      serialNumber: '',
      inventoryNumber: '',
      inspectionIntervalDays: null,
      assetTypeUuid: null,
      fieldDefinitions: [],
      fieldValues: [],
      images: [],
    };
  }

  private normalizeRequest(request: InventoryRequest): InventoryRequest {
    return {
      ...request,
      invId: request.invId || undefined,
      description: request.description || null,
      address: request.address || null,
      color: request.color || null,
      serialNumber: request.serialNumber || null,
      inventoryNumber: request.inventoryNumber || null,
      inspectionIntervalDays: request.inspectionIntervalDays ?? null,
      assetTypeUuid: request.assetTypeUuid || null,
      fieldDefinitions: request.fieldDefinitions ?? [],
      fieldValues: request.fieldValues ?? [],
      images: request.images?.filter((image) => image.url?.trim()) ?? [],
    };
  }

  protected get generalFields(): FieldConfig[] {
    return this.config.fields.filter((field) => field.key !== 'inspectionIntervalDays');
  }

  protected get inspectionFields(): FieldConfig[] {
    return this.config.fields.filter((field) => field.key === 'inspectionIntervalDays');
  }

  protected addCustomField(): void {
    if (this.config.resourceType === 'CATEGORY') {
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
    if (this.config.resourceType === 'CATEGORY') {
      this.form.fieldDefinitions = (this.form.fieldDefinitions ?? []).filter((_, fieldIndex) => fieldIndex !== index);
      return;
    }

    this.form.fieldValues = (this.form.fieldValues ?? []).filter((_, fieldIndex) => fieldIndex !== index);
  }

  protected addImage(kind: 'THUMBNAIL' | 'GALLERY' = 'GALLERY'): void {
    this.form.images = [
      ...(this.form.images ?? []),
      {
        kind,
        url: '',
        fileName: '',
        contentType: '',
        sortOrder: this.form.images?.length ?? 0,
      },
    ];
  }

  protected removeImage(index: number): void {
    this.form.images = (this.form.images ?? []).filter((_, imageIndex) => imageIndex !== index);
  }

  protected selectAssetType(assetTypeUuid: string | null): void {
    this.form.assetTypeUuid = assetTypeUuid;
    const customFields = (this.form.fieldValues ?? []).filter((field) => field.customAssetField);
    const assetType = this.assetTypes.find((type) => type.uuid === assetTypeUuid);
    if (!assetType) {
      this.form.fieldValues = customFields;
      return;
    }

    this.form.inspectionIntervalDays = assetType.inspectionIntervalDays ?? this.form.inspectionIntervalDays;
    this.form.fieldValues = [
      ...(assetType.fieldDefinitions ?? []).map((definition) => ({
        fieldKey: definition.fieldKey,
        name: definition.name,
        value: '',
        customAssetField: false,
      })),
      ...customFields,
    ];
  }

  private loadAssetTypes(): void {
    this.api.list<InventoryItem>('asset-types').subscribe({
      next: (types) => {
        this.assetTypes = types;
      },
      error: () => {
        this.error = 'Typen konnten nicht geladen werden.';
      },
    });
  }
}
