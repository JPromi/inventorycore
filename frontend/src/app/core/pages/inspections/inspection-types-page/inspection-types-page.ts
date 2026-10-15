import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideClipboardList, LucidePencil, LucidePlus, LucideSearch, LucideTrash2, LucideX } from '@lucide/angular';
import { Subject, Subscription, debounceTime, skip } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { InfiniteScroll } from '../../../components/infinite-scroll.directive';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { InspectionService, InspectionType, intervalText } from '../../../service/inspection.service';
import { AreaService } from '../../../service/area.service';
import { PermissionService } from '../../../service/permission.service';
import { PagedList, SEARCH_DELAY_MS } from '../../../util/paged-list';

/** Configuration list of the inspection types. */
@Component({
  selector: 'app-inspection-types-page',
  imports: [FormsModule, InfiniteScroll, ListActions, SelectableRow, SelectionCheckbox, RouterLink, LucideClipboardList, LucidePencil, LucidePlus, LucideSearch, LucideTrash2, LucideX],
  templateUrl: './inspection-types-page.html',
  styleUrl: './inspection-types-page.scss',
})
export class InspectionTypesPage implements OnInit, OnDestroy {
  /** Searched on the server (also by the sidebar areas), loaded page by page while scrolling. */
  protected readonly list = new PagedList<InspectionType>((page, size) =>
    this.api.typePage({ q: this.search, areas: this.areaService.selected }, page, size));
  protected search = '';
  protected readonly canBulkDelete = (item: InspectionType) => item.deletable;
  protected readonly bulkDelete = (item: InspectionType) => this.api.deleteType(item.uuid);
  protected error = '';
  private readonly searchChanges = new Subject<void>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly api: InspectionService,
    private readonly router: Router,
    private readonly permissions: PermissionService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    this.list.reload();
    this.subscriptions.add(this.areaService.selected$.pipe(skip(1)).subscribe(() => this.list.reload()));
    this.subscriptions.add(this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.list.destroy();
  }

  /** Loaded types of the areas chosen in the sidebar (types without areas are for all). */
  protected get visibleTypes(): InspectionType[] {
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
    this.list.remove((type) => uuids.includes(type.uuid));
  }

  protected get canEdit(): boolean {
    return this.permissions.can('ASSET_TYPE', 'edit');
  }

  protected readonly intervalText = intervalText;

  protected generalFieldCount(type: InspectionType): number {
    return type.fields.filter((field) => !field.assetTypeUuid).length;
  }

  /** "Laptop (2), Fahrzeug (5)" */
  protected typeFieldSummary(type: InspectionType): string[] {
    const counts = new Map<string, number>();
    for (const field of type.fields) {
      if (field.assetTypeUuid) {
        const name = field.assetTypeName ?? 'Typ';
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([name, count]) => `${name} (${count})`);
  }

  protected edit(type: InspectionType): void {
    this.router.navigate(['/config/inspection-templates', type.uuid]);
  }

  protected async remove(type: InspectionType, event: Event): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.confirmDialog.confirm({
      title: 'Prüfungsvorlage löschen?',
      message: type.inspectionCount
        ? `„${type.name}“ wird gelöscht. Die ${type.inspectionCount} Prüfungen dieser Art bleiben mit allen Werten erhalten.`
        : `„${type.name}“ wird gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.deleteType(type.uuid).subscribe({
      next: () => this.removed([type.uuid]),
      error: () => (this.error = 'Prüfungsvorlage konnte nicht gelöscht werden.'),
    });
  }
}
