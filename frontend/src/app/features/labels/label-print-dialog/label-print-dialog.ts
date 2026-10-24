import {
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft, LucideChevronRight, LucidePrinter, LucideX } from '@lucide/angular';

import { SearchSelect, SelectOption } from '../../../shared/components/search-select/search-select';
import { t } from '../../../core/i18n/i18n';
import { TranslateCountPipe, TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AreaService } from '../../../core/service/area.service';
import { InventoryItem } from '../../inventory/data-access/inventory-api.service';
import { LabelRenderer } from '../label-renderer/label-renderer';
import { LabelSheetPreview } from '../label-sheet-preview/label-sheet-preview';
import { LabelTemplateService } from '../label-template.service';
import {
  LabelContext,
  LabelElement,
  LabelSheet,
  LabelTemplate,
  assetLabelContext,
  defaultTemplateFor,
  parseElements,
} from '../label.model';
import { printLabels } from '../print';
import { PdfPrintService } from '../../../shared/components/pdf-print-dialog/pdf-print.service';

const MM_TO_PX = 96 / 25.4;

/** Lets the user pick a label template for one or more assets, shows a preview and prints them. */
@Component({
  selector: 'app-label-print-dialog',
  imports: [
    FormsModule,
    RouterLink,
    SearchSelect,
    LabelRenderer,
    LabelSheetPreview,
    TranslatePipe,
    TranslateCountPipe,
    LucideChevronLeft,
    LucideChevronRight,
    LucidePrinter,
    LucideX,
  ],
  templateUrl: './label-print-dialog.html',
  styleUrl: './label-print-dialog.scss',
})
export class LabelPrintDialog implements OnInit, OnChanges {
  @Input({ required: true }) assets: InventoryItem[] = [];
  @Input() locations: InventoryItem[] = [];
  @Input() assetTypes: InventoryItem[] = [];
  @Output() readonly closed = new EventEmitter<void>();

  /** One hidden label per asset, these are what gets printed. */
  @ViewChildren('printLabel') private renderers?: QueryList<LabelRenderer>;

  protected templates: LabelTemplate[] = [];
  protected templateUuid: string | null = null;
  protected elements: LabelElement[] = [];
  protected copies = 1;
  /** Positions on the first sheet that are already used (sheet templates only). */
  protected skip = 0;
  /** Asset shown in the preview. */
  protected index = 0;
  protected contexts: LabelContext[] = [];
  protected loading = true;
  protected error = '';
  protected preparing = false;
  private readonly printAbort = new AbortController();

  constructor(
    private readonly api: LabelTemplateService,
    private readonly areaService: AreaService,
    private readonly pdf: PdfPrintService,
    private readonly destroyRef: DestroyRef,
  ) {
    this.destroyRef.onDestroy(() => this.printAbort.abort());
  }

  ngOnChanges(): void {
    this.index = Math.min(this.index, Math.max(0, this.assets.length - 1));
    this.contexts = this.assets.map((asset) =>
      assetLabelContext(asset, {
        locations: this.locations,
        assetTypes: this.assetTypes,
        areaName: (uuid) => this.areaService.name(uuid),
      }),
    );
  }

  ngOnInit(): void {
    this.api.list().subscribe({
      next: (templates) => {
        const areas = [...new Set(this.assets.flatMap((asset) => asset.areaUuids ?? []))];
        // templates of the assets' own areas first
        this.templates = templates.sort(
          (a, b) => Number(areas.includes(b.areaUuid)) - Number(areas.includes(a.areaUuid)),
        );
        const preselected = defaultTemplateFor(
          templates,
          areas,
          this.areaService.defaultArea?.uuid,
        );
        this.select(preselected?.uuid ?? null);
        this.loading = false;
      },
      error: () => {
        this.error = t('labelPrint.loadFailed');
        this.loading = false;
      },
    });
  }

  protected get template(): LabelTemplate | undefined {
    return this.templates.find((template) => template.uuid === this.templateUuid);
  }

  protected get options(): SelectOption[] {
    return this.templates.map((template) => ({
      value: template.uuid,
      label: template.name,
      hint: [
        this.areaService.name(template.areaUuid),
        t('labels.size', { width: template.widthMm, height: template.heightMm }),
        template.sheet
          ? t('labels.sheetSize', { columns: template.sheet.columns, rows: template.sheet.rows })
          : '',
        template.defaultForArea ? t('labelTemplates.default') : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }));
  }

  protected get total(): number {
    return this.assets.length * this.clampedCopies;
  }

  protected get sheet(): LabelSheet | null {
    return this.template?.sheet ?? null;
  }

  protected get perSheet(): number {
    return this.sheet ? this.sheet.columns * this.sheet.rows : 1;
  }

  protected get sheetCount(): number {
    return Math.ceil((this.clampedSkip + this.total) / this.perSheet);
  }

  private get clampedSkip(): number {
    return Math.min(this.perSheet - 1, Math.max(0, Math.floor(this.skip || 0)));
  }

  private get clampedCopies(): number {
    return Math.min(100, Math.max(1, this.copies || 1));
  }

  protected get zoom(): number {
    const template = this.template;
    if (!template) {
      return 1;
    }
    return Math.min(3, 440 / (template.widthMm * MM_TO_PX), 260 / (template.heightMm * MM_TO_PX));
  }

  protected select(uuid: string | null): void {
    this.templateUuid = uuid;
    this.skip = 0;
    this.elements = parseElements(this.template?.elementsJson);
  }

  protected async print(): Promise<void> {
    const template = this.template;
    if (!template || !this.renderers?.length || this.preparing) {
      return;
    }
    this.preparing = true;
    this.error = '';
    try {
      await printLabels(
        this.renderers.map((renderer) => renderer.nativeLabel),
        template.widthMm,
        template.heightMm,
        this.clampedCopies,
        this.pdf,
        this.printAbort.signal,
        template.sheet ? { sheet: template.sheet, skip: this.clampedSkip } : undefined,
      );
    } catch {
      if (!this.destroyRef.destroyed) {
        this.error = t('pdfPrint.prepareFailed');
      }
    } finally {
      this.preparing = false;
    }
  }

  @HostListener('document:keydown.escape')
  protected close(): void {
    this.closed.emit();
  }
}
