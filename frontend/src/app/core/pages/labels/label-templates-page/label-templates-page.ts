import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LucideCopy, LucidePencil, LucidePlus, LucideQrCode, LucideTrash2 } from '@lucide/angular';
import { forkJoin } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { LabelRenderer } from '../../../labels/label-renderer/label-renderer';
import { LabelTemplateService } from '../../../labels/label-template.service';
import { LabelElement, LabelTemplate, SAMPLE_CONTEXT, parseElements } from '../../../labels/label.model';
import { AreaService } from '../../../service/area.service';
import { PermissionService } from '../../../service/permission.service';

@Component({
  selector: 'app-label-templates-page',
  imports: [ListActions, SelectableRow, SelectionCheckbox, LabelRenderer, LucideCopy, LucidePencil, LucidePlus, LucideQrCode, LucideTrash2],
  templateUrl: './label-templates-page.html',
  styleUrl: './label-templates-page.scss',
})
export class LabelTemplatesPage implements OnInit {
  protected readonly sample = SAMPLE_CONTEXT;
  protected templates: LabelTemplate[] = [];
  protected readonly canBulkDelete = (item: LabelTemplate) => this.canDelete(item);
  protected readonly bulkDelete = (item: LabelTemplate) => this.api.delete(item.uuid);
  protected get selectionItems(): LabelTemplate[] { return this.groups.flatMap(group => group.templates); }
  protected loading = false;
  protected error = '';
  private readonly elementCache = new Map<string, LabelElement[]>();

  constructor(
    private readonly api: LabelTemplateService,
    private readonly router: Router,
    private readonly confirmDialog: ConfirmDialogService,
    protected readonly areaService: AreaService,
    protected readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  /** Templates grouped by area, areas sorted like in the area list (default first). */
  protected get groups(): { areaUuid: string; areaName: string; templates: LabelTemplate[] }[] {
    const order = this.areaService.areas.map((area) => area.uuid);
    const uuids = [...new Set(this.templates.map((template) => template.areaUuid))].sort(
      (a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999),
    );
    return uuids.map((areaUuid) => ({
      areaUuid,
      areaName: this.areaService.name(areaUuid),
      templates: this.templates.filter((template) => template.areaUuid === areaUuid),
    }));
  }

  protected get canCreate(): boolean {
    return this.permissions.can('ASSET_TYPE', 'create');
  }

  protected canEdit(template: LabelTemplate): boolean {
    return this.permissions.can('ASSET_TYPE', 'edit', [template.areaUuid]);
  }

  protected canDelete(template: LabelTemplate): boolean {
    return this.permissions.can('ASSET_TYPE', 'delete', [template.areaUuid]);
  }

  protected elements(template: LabelTemplate): LabelElement[] {
    let elements = this.elementCache.get(template.uuid);
    if (!elements) {
      elements = parseElements(template.elementsJson);
      this.elementCache.set(template.uuid, elements);
    }
    return elements;
  }

  /** Fits the preview into the card (about 15rem wide, 8rem high). */
  protected zoom(template: LabelTemplate): number {
    const mmToPx = 96 / 25.4;
    return Math.min(1.6, 230 / (template.widthMm * mmToPx), 120 / (template.heightMm * mmToPx));
  }

  protected create(): void {
    this.router.navigate(['/config/labels/new']);
  }

  protected edit(template: LabelTemplate): void {
    if (this.canEdit(template)) {
      this.router.navigate(['/config/labels', template.uuid, 'edit']);
    }
  }

  protected duplicate(template: LabelTemplate, event: Event): void {
    event.stopPropagation();
    this.api
      .create({
        name: `${template.name} (Kopie)`,
        description: template.description ?? null,
        areaUuid: template.areaUuid,
        defaultForArea: false,
        widthMm: template.widthMm,
        heightMm: template.heightMm,
        elementsJson: template.elementsJson,
      })
      .subscribe({
        next: (copy) => this.router.navigate(['/config/labels', copy.uuid, 'edit']),
        error: () => (this.error = 'Vorlage konnte nicht kopiert werden.'),
      });
  }

  protected async remove(template: LabelTemplate, event: Event): Promise<void> {
    event.stopPropagation();
    if (!(await this.confirmDialog.confirmDelete(template.name))) {
      return;
    }
    this.api.delete(template.uuid).subscribe({
      next: () => this.load(),
      error: () => (this.error = 'Vorlage konnte nicht gelöscht werden.'),
    });
  }

  protected load(): void {
    this.loading = true;
    this.error = '';
    this.elementCache.clear();
    forkJoin({ templates: this.api.list(), areas: this.areaService.load() }).subscribe({
      next: ({ templates }) => {
        this.templates = templates;
        this.loading = false;
      },
      error: () => {
        this.error = 'Vorlagen konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }
}
