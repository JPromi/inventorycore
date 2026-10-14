import { Component, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucidePrinter, LucideX } from '@lucide/angular';

import { SearchSelect, SelectOption } from '../../components/search-select/search-select';
import { AreaService } from '../../service/area.service';
import { InventoryItem } from '../../service/inventory-api.service';
import { LabelRenderer } from '../label-renderer/label-renderer';
import { LabelTemplateService } from '../label-template.service';
import { LabelContext, LabelElement, LabelTemplate, assetLabelContext, defaultTemplateFor, parseElements } from '../label.model';
import { printLabel } from '../print';

const MM_TO_PX = 96 / 25.4;

/** Lets the user pick a label template for an asset, shows a preview and prints it. */
@Component({
  selector: 'app-label-print-dialog',
  imports: [FormsModule, RouterLink, SearchSelect, LabelRenderer, LucidePrinter, LucideX],
  templateUrl: './label-print-dialog.html',
  styleUrl: './label-print-dialog.scss',
})
export class LabelPrintDialog implements OnInit {
  @Input({ required: true }) asset!: InventoryItem;
  @Input() locations: InventoryItem[] = [];
  @Input() assetTypes: InventoryItem[] = [];
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild(LabelRenderer) private renderer?: LabelRenderer;

  protected templates: LabelTemplate[] = [];
  protected templateUuid: string | null = null;
  protected elements: LabelElement[] = [];
  protected copies = 1;
  protected loading = true;
  protected error = '';

  constructor(
    private readonly api: LabelTemplateService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    this.api.list().subscribe({
      next: (templates) => {
        const areas = this.asset.areaUuids ?? [];
        // templates of the asset's own areas first
        this.templates = templates.sort((a, b) => Number(areas.includes(b.areaUuid)) - Number(areas.includes(a.areaUuid)));
        const preselected = defaultTemplateFor(templates, areas, this.areaService.defaultArea?.uuid);
        this.select(preselected?.uuid ?? null);
        this.loading = false;
      },
      error: () => {
        this.error = 'Vorlagen konnten nicht geladen werden.';
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
      hint: `${this.areaService.name(template.areaUuid)} · ${template.widthMm} × ${template.heightMm} mm${template.defaultForArea ? ' · Standard' : ''}`,
    }));
  }

  protected get context(): LabelContext {
    return assetLabelContext(this.asset, {
      locations: this.locations,
      assetTypes: this.assetTypes,
      areaName: (uuid) => this.areaService.name(uuid),
    });
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
    this.elements = parseElements(this.template?.elementsJson);
  }

  protected print(): void {
    const template = this.template;
    if (!template || !this.renderer) {
      return;
    }
    printLabel(this.renderer.nativeLabel, template.widthMm, template.heightMm, Math.min(100, Math.max(1, this.copies || 1)));
  }

  @HostListener('document:keydown.escape')
  protected close(): void {
    this.closed.emit();
  }
}
