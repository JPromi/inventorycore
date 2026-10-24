import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideChevronDown,
  LucideChevronUp,
  LucideCopy,
  LucideImage,
  LucideQrCode,
  LucideSave,
  LucideSquare,
  LucideTrash2,
  LucideType,
  LucideZoomIn,
  LucideZoomOut,
} from '@lucide/angular';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  SearchSelect,
  SelectOption,
} from '../../../../shared/components/search-select/search-select';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { LabelRenderer } from '../../label-renderer/label-renderer';
import { LabelTemplateService } from '../../label-template.service';
import {
  LabelContext,
  LabelElement,
  LabelElementType,
  LabelSettings,
  LabelSizePreset,
  PLACEHOLDERS,
  Placeholder,
  SAMPLE_CONTEXT,
  SYMBOLOGIES,
  assetLabelContext,
  keepInSafeArea,
  maxSafeAreaMm,
  newElementId,
  parseElements,
} from '../../label.model';
import { AreaService } from '../../../../core/service/area.service';
import {
  InventoryApiService,
  InventoryItem,
} from '../../../inventory/data-access/inventory-api.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { CustomizationService } from '../../../../core/service/customization.service';

const MM_TO_PX = 96 / 25.4;
/** Used when the label settings cannot be loaded. */
const FALLBACK_SETTINGS: LabelSettings = { safeAreaMm: 5, sizePresets: [] };

@Component({
  selector: 'app-label-editor-page',
  imports: [
    FormsModule,
    RouterLink,
    SearchSelect,
    LabelRenderer,
    TranslatePipe,
    LucideArrowLeft,
    LucideChevronDown,
    LucideChevronUp,
    LucideCopy,
    LucideImage,
    LucideQrCode,
    LucideSave,
    LucideSquare,
    LucideTrash2,
    LucideType,
    LucideZoomIn,
    LucideZoomOut,
  ],
  templateUrl: './label-editor-page.html',
  styleUrl: './label-editor-page.scss',
})
export class LabelEditorPage implements OnInit {
  protected presets: LabelSizePreset[] = [];
  private defaultSafeAreaMm = FALLBACK_SETTINGS.safeAreaMm;
  protected readonly symbologies = SYMBOLOGIES;
  protected readonly symbologyOptions: SelectOption[] = SYMBOLOGIES.map((entry) => ({
    value: entry.id,
    label: entry.label,
    hint: entry.hint,
  }));
  protected uuid: string | null = null;
  protected name = '';
  protected description = '';
  protected areaUuid: string | null = null;
  protected defaultForArea = false;
  protected widthMm = 62;
  protected heightMm = 29;
  protected safeAreaMm = 0;
  protected elements: LabelElement[] = [];
  protected selectedId: string | null = null;
  protected zoom = 2;
  protected loading = false;
  protected saving = false;
  protected error = '';

  protected assets: InventoryItem[] = [];
  protected locations: InventoryItem[] = [];
  protected assetTypes: InventoryItem[] = [];
  protected sampleAssetUuid: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: LabelTemplateService,
    private readonly inventoryApi: InventoryApiService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly areaService: AreaService,
    private readonly permissions: PermissionService,
    protected readonly customization: CustomizationService,
  ) {}

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    this.load();
  }

  // ---- derived state ----

  protected get title(): string {
    return t(this.uuid ? 'labelEditor.titleEdit' : 'labelEditor.titleCreate');
  }

  protected get selected(): LabelElement | null {
    return this.elements.find((element) => element.id === this.selectedId) ?? null;
  }

  protected get areaOptions(): SelectOption[] {
    const action = this.uuid ? 'edit' : 'create';
    return this.areaService.areas
      .filter((area) => this.permissions.canInArea('ASSET_TYPE', action, area.uuid))
      .map((area) => ({
        value: area.uuid,
        label: area.name,
        color: area.color,
        hint: area.defaultArea ? t('labelEditor.defaultArea') : undefined,
      }));
  }

  protected get assetOptions(): SelectOption[] {
    return this.assets.map((asset) => ({
      value: asset.uuid,
      label: asset.name,
      hint: asset.invId ?? undefined,
    }));
  }

  protected get context(): LabelContext {
    const asset = this.assets.find((entry) => entry.uuid === this.sampleAssetUuid);
    if (!asset) {
      return SAMPLE_CONTEXT;
    }
    return assetLabelContext(asset, {
      locations: this.locations,
      assetTypes: this.assetTypes,
      areaName: (uuid) => this.areaService.name(uuid),
    });
  }

  /** Standard placeholders plus the custom fields of the sample asset. */
  protected get placeholders(): Placeholder[] {
    const asset = this.assets.find((entry) => entry.uuid === this.sampleAssetUuid);
    const fields = (asset?.fieldValues ?? []).map((field) => ({
      key: `field:${field.fieldKey ?? field.name}`,
      label: field.name,
    }));
    return [...PLACEHOLDERS, ...fields];
  }

  protected get maxSafeArea(): number {
    return maxSafeAreaMm(this.widthMm, this.heightMm);
  }

  protected get selectedSymbology() {
    return SYMBOLOGIES.find((entry) => entry.id === this.selected?.symbology);
  }

  // ---- size ----

  protected applyPreset(index: string): void {
    const preset = this.presets[Number(index)];
    if (preset) {
      this.widthMm = preset.widthMm;
      this.heightMm = preset.heightMm;
      this.safeAreaMm = preset.safeAreaMm ?? this.defaultSafeAreaMm;
      this.onSizeChange();
    }
  }

  /** Keeps all elements inside the safe area after the size or the safe area changed. */
  protected onSizeChange(): void {
    this.widthMm = Math.max(5, Number(this.widthMm) || 5);
    this.heightMm = Math.max(5, Number(this.heightMm) || 5);
    this.safeAreaMm = Math.min(Math.max(0, Number(this.safeAreaMm) || 0), this.maxSafeArea);
    this.elements.forEach((element) => this.keepInside(element));
    this.fitZoom();
  }

  /** Moves an element back out of the safe area, e.g. after typing a position. */
  protected keepInside(element: LabelElement): void {
    keepInSafeArea(element, this.widthMm, this.heightMm, this.safeAreaMm);
  }

  protected setZoom(zoom: number): void {
    this.zoom = Math.min(8, Math.max(0.5, Math.round(zoom * 4) / 4));
  }

  protected fitZoom(): void {
    this.setZoom(Math.min(620 / (this.widthMm * MM_TO_PX), 420 / (this.heightMm * MM_TO_PX)));
  }

  // ---- elements ----

  protected add(type: LabelElementType): void {
    // the safe area already keeps elements off the edge, without one they start 2 mm inside
    const inset = this.safeAreaMm > 0 ? this.safeAreaMm : 2;
    const innerWidth = this.widthMm - 2 * inset;
    const innerHeight = this.heightMm - 2 * inset;
    const base = { id: newElementId(), type, x: inset, y: inset };
    let element: LabelElement;
    switch (type) {
      case 'text':
        element = {
          ...base,
          width: Math.min(30, innerWidth),
          height: 6,
          content: '{name}',
          fontSize: 9,
          align: 'left',
          verticalAlign: 'top',
        };
        break;
      case 'barcode': {
        const size = Math.max(5, Math.min(20, innerHeight, innerWidth));
        element = {
          ...base,
          width: size,
          height: size,
          content: '{invId}',
          symbology: 'qrcode',
          showText: true,
        };
        break;
      }
      case 'box':
        element = {
          ...base,
          x: this.safeAreaMm || 0.5,
          y: this.safeAreaMm || 0.5,
          width: this.widthMm - 2 * (this.safeAreaMm || 0.5),
          height: this.heightMm - 2 * (this.safeAreaMm || 0.5),
          borderWidth: 0.3,
        };
        break;
      case 'logo':
        element = {
          ...base,
          width: Math.max(1, Math.min(20, innerWidth)),
          height: Math.max(1, Math.min(10, innerHeight)),
        };
        placement: for (let y = inset; y <= this.heightMm - inset - element.height; y++) {
          for (let x = inset; x <= this.widthMm - inset - element.width; x++) {
            if (
              this.elements
                .filter((existing) => existing.type !== 'box')
                .every(
                  (existing) =>
                    x + element.width < existing.x ||
                    x > existing.x + existing.width ||
                    y + element.height < existing.y ||
                    y > existing.y + existing.height,
                )
            ) {
              element.x = x;
              element.y = y;
              break placement;
            }
          }
        }
        break;
    }
    this.keepInside(element);
    this.elements = [...this.elements, element];
    this.selectedId = element.id;
  }

  protected duplicate(element: LabelElement): void {
    const copy = { ...element, id: newElementId(), x: element.x + 2, y: element.y + 2 };
    this.keepInside(copy);
    this.elements = [...this.elements, copy];
    this.selectedId = copy.id;
  }

  protected remove(element: LabelElement): void {
    this.elements = this.elements.filter((entry) => entry !== element);
    if (this.selectedId === element.id) {
      this.selectedId = null;
    }
  }

  /** Later elements are drawn on top. */
  protected moveLayer(element: LabelElement, direction: -1 | 1): void {
    const index = this.elements.indexOf(element);
    const target = index + direction;
    if (target < 0 || target >= this.elements.length) {
      return;
    }
    const elements = [...this.elements];
    [elements[index], elements[target]] = [elements[target], elements[index]];
    this.elements = elements;
  }

  protected changeSymbology(symbology: string | null): void {
    if (this.selected && symbology) {
      this.selected.symbology = symbology;
      const twoDimensional = SYMBOLOGIES.find((entry) => entry.id === symbology)?.twoDimensional;
      // square box for 2D codes, a flat one for linear codes
      if (twoDimensional) {
        const size = Math.min(this.selected.width, this.selected.height);
        this.selected.width = size;
        this.selected.height = size;
      } else if (this.selected.height >= this.selected.width) {
        this.selected.width = Math.min(
          this.widthMm - this.safeAreaMm - this.selected.x,
          Math.max(30, this.selected.width),
        );
        this.selected.height = Math.min(this.selected.height, 12);
      }
    }
  }

  protected insertPlaceholder(key: string): void {
    if (this.selected && (this.selected.type === 'text' || this.selected.type === 'barcode')) {
      this.selected.content = `${this.selected.content ?? ''}{${key}}`;
    }
  }

  protected elementLabel(element: LabelElement): string {
    switch (element.type) {
      case 'text':
        return element.content || t('labelEditor.elementTypes.text');
      case 'barcode':
        return `${SYMBOLOGIES.find((entry) => entry.id === element.symbology)?.label ?? t('labelEditor.codeFallback')}: ${element.content ?? ''}`;
      case 'box':
        return t('labelEditor.elementTypes.box');
      case 'logo':
        return t('labelEditor.elementTypes.logo');
    }
  }

  /** Arrow keys move, Delete removes, Ctrl+D duplicates the selected element. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (!this.selected || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    const step = event.shiftKey ? 2 : 0.5;
    const element = this.selected;
    switch (event.key) {
      case 'ArrowLeft':
        element.x -= step;
        this.keepInside(element);
        break;
      case 'ArrowRight':
        element.x += step;
        this.keepInside(element);
        break;
      case 'ArrowUp':
        element.y -= step;
        this.keepInside(element);
        break;
      case 'ArrowDown':
        element.y += step;
        this.keepInside(element);
        break;
      case 'Delete':
      case 'Backspace':
        this.remove(element);
        break;
      case 'Escape':
        this.selectedId = null;
        break;
      case 'd':
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        this.duplicate(element);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // ---- persistence ----

  protected save(): void {
    if (this.saving) {
      return;
    }
    if (!this.name.trim()) {
      this.error = t('labelEditor.nameMissing');
      return;
    }
    this.saving = true;
    this.error = '';
    const request = {
      name: this.name.trim(),
      description: this.description.trim() || null,
      areaUuid: this.areaUuid,
      defaultForArea: this.defaultForArea,
      widthMm: this.widthMm,
      heightMm: this.heightMm,
      safeAreaMm: this.safeAreaMm,
      elementsJson: JSON.stringify(this.elements.map((element) => this.round(element))),
    };
    const save$ = this.uuid ? this.api.update(this.uuid, request) : this.api.create(request);
    save$.subscribe({
      next: () => this.router.navigate(['/config/labels']),
      error: () => {
        this.saving = false;
        this.error = t('common.errors.save');
      },
    });
  }

  protected async deleteTemplate(): Promise<void> {
    if (!this.uuid || !(await this.confirmDialog.confirmDelete(this.name))) {
      return;
    }
    this.api.delete(this.uuid).subscribe({
      next: () => this.router.navigate(['/config/labels']),
      error: () => (this.error = t('labelTemplates.deleteFailed')),
    });
  }

  private round(element: LabelElement): LabelElement {
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      ...element,
      x: round(element.x),
      y: round(element.y),
      width: round(element.width),
      height: round(element.height),
    };
  }

  private load(): void {
    this.loading = true;
    const list = (endpoint: string) =>
      this.inventoryApi
        .list<InventoryItem>(endpoint)
        .pipe(catchError(() => of([] as InventoryItem[])));
    forkJoin({
      template: this.uuid ? this.api.get(this.uuid) : of(null),
      areas: this.areaService.load(),
      assets: list('assets'),
      locations: list('locations'),
      assetTypes: list('asset-types'),
      settings: this.api.settings().pipe(catchError(() => of(FALLBACK_SETTINGS))),
    }).subscribe({
      next: ({ template, assets, locations, assetTypes, settings }) => {
        this.presets = settings.sizePresets;
        this.defaultSafeAreaMm = settings.safeAreaMm;
        this.assets = assets.sort((a, b) => a.name.localeCompare(b.name));
        this.locations = locations;
        this.assetTypes = assetTypes;
        if (template) {
          this.name = template.name;
          this.description = template.description ?? '';
          this.areaUuid = template.areaUuid;
          this.defaultForArea = template.defaultForArea;
          this.widthMm = template.widthMm;
          this.heightMm = template.heightMm;
          this.safeAreaMm = template.safeAreaMm ?? 0;
          this.elements = parseElements(template.elementsJson);
          this.onSizeChange();
        } else {
          this.safeAreaMm = Math.min(settings.safeAreaMm, this.maxSafeArea);
          const selected = this.areaService.selected.find((uuid) =>
            this.areaOptions.some((option) => option.value === uuid),
          );
          this.areaUuid =
            selected ?? this.areaService.defaultArea?.uuid ?? this.areaOptions[0]?.value ?? null;
          this.add('barcode');
          this.add('text');
          const [code, text] = this.elements;
          text.x = code.x + code.width + 2;
          text.width = Math.max(5, this.widthMm - text.x - Math.max(this.safeAreaMm, 2));
          this.keepInside(text);
          this.selectedId = null;
        }
        this.fitZoom();
        this.loading = false;
      },
      error: () => {
        this.error = t('labelEditor.loadFailed');
        this.loading = false;
      },
    });
  }
}
