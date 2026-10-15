import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideCopy, LucidePencil, LucidePlus, LucideQrCode, LucideSearch, LucideTrash2, LucideX } from '@lucide/angular';
import { Subject, Subscription, debounceTime } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { InfiniteScroll } from '../../../components/infinite-scroll.directive';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { LabelRenderer } from '../../../labels/label-renderer/label-renderer';
import { LabelTemplateService } from '../../../labels/label-template.service';
import { LabelElement, LabelTemplate, SAMPLE_CONTEXT, parseElements } from '../../../labels/label.model';
import { AreaService } from '../../../service/area.service';
import { PermissionService } from '../../../service/permission.service';
import { PagedList, SEARCH_DELAY_MS } from '../../../util/paged-list';

@Component({
  selector: 'app-label-templates-page',
  imports: [FormsModule, InfiniteScroll, ListActions, SelectableRow, SelectionCheckbox, LabelRenderer, LucideCopy, LucidePencil, LucidePlus, LucideQrCode, LucideSearch, LucideTrash2, LucideX],
  templateUrl: './label-templates-page.html',
  styleUrl: './label-templates-page.scss',
})
export class LabelTemplatesPage implements OnInit, OnDestroy {
  protected readonly sample = SAMPLE_CONTEXT;
  /** Searched on the server, loaded page by page while scrolling. */
  protected readonly list = new PagedList<LabelTemplate>((page, size) => this.api.page(this.search, page, size));
  protected search = '';
  protected readonly canBulkDelete = (item: LabelTemplate) => this.canDelete(item);
  protected readonly bulkDelete = (item: LabelTemplate) => this.api.delete(item.uuid);
  protected get selectionItems(): LabelTemplate[] { return this.groups.flatMap(group => group.templates); }
  protected error = '';
  private readonly elementCache = new Map<string, LabelElement[]>();
  private readonly searchChanges = new Subject<void>();
  private readonly searchSubscription = this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload());

  constructor(
    private readonly api: LabelTemplateService,
    private readonly router: Router,
    private readonly confirmDialog: ConfirmDialogService,
    protected readonly areaService: AreaService,
    protected readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.areaService.load().subscribe();
    this.load();
  }

  ngOnDestroy(): void {
    this.searchSubscription.unsubscribe();
    this.list.destroy();
  }

  protected get templates(): LabelTemplate[] {
    return this.list.items;
  }

  protected onSearchChange(): void {
    this.searchChanges.next();
  }

  protected clearSearch(): void {
    this.search = '';
    this.list.reload();
  }

  protected removed(uuids: string[]): void {
    this.list.remove((template) => uuids.includes(template.uuid));
  }

  /** Loaded templates grouped by area, in the server's order (default area first, then by name). */
  protected get groups(): { areaUuid: string; areaName: string; templates: LabelTemplate[] }[] {
    const groups: { areaUuid: string; areaName: string; templates: LabelTemplate[] }[] = [];
    for (const template of this.templates) {
      let group = groups.find((entry) => entry.areaUuid === template.areaUuid);
      if (!group) {
        group = { areaUuid: template.areaUuid, areaName: this.areaService.name(template.areaUuid), templates: [] };
        groups.push(group);
      }
      group.templates.push(template);
    }
    return groups;
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
      next: () => this.removed([template.uuid]),
      error: () => (this.error = 'Vorlage konnte nicht gelöscht werden.'),
    });
  }

  protected load(): void {
    this.error = '';
    this.elementCache.clear();
    this.list.reload();
  }
}
