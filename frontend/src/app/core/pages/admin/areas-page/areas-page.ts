import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideLayers, LucidePencil, LucidePlus, LucideSave, LucideSearch, LucideTrash2, LucideX } from '@lucide/angular';
import { Subject, debounceTime } from 'rxjs';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { InfiniteScroll } from '../../../components/infinite-scroll.directive';
import { AdminApiService, AdminAreaRequest } from '../../../service/admin-api.service';
import { AreaItem, AreaService } from '../../../service/area.service';
import { PagedList, SEARCH_DELAY_MS } from '../../../util/paged-list';

const COLORS = ['#b62f2f', '#d97706', '#15803d', '#0f766e', '#2563eb', '#7c3aed', '#db2777', '#475569'];

@Component({
  selector: 'app-areas-page',
  imports: [InfiniteScroll, ListActions, SelectableRow, SelectionCheckbox, FormsModule, LucideLayers, LucidePencil, LucidePlus, LucideSave, LucideSearch, LucideTrash2, LucideX],
  templateUrl: './areas-page.html',
  styleUrl: './areas-page.scss',
})
export class AreasPage implements OnInit, OnDestroy {
  protected readonly canBulkDelete = (item: AreaItem) => !item.defaultArea;
  protected readonly bulkDelete = (item: AreaItem) => this.api.deleteArea(item.uuid);
  protected readonly colors = COLORS;
  /** Searched on the server, loaded page by page while scrolling. */
  protected readonly list = new PagedList<AreaItem>((page, size) => this.api.areaPage(this.search, page, size));
  protected search = '';
  protected saving = false;
  protected error = '';
  /** uuid of the area being edited, 'new' for a new one, null when the editor is closed. */
  protected editing: string | null = null;
  protected form: AdminAreaRequest = this.emptyForm();
  private readonly searchChanges = new Subject<void>();
  private readonly searchSubscription = this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload());

  constructor(
    private readonly api: AdminApiService,
    private readonly areaService: AreaService,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  protected get areas(): AreaItem[] {
    return this.list.items;
  }

  ngOnDestroy(): void {
    this.searchSubscription.unsubscribe();
    this.list.destroy();
  }

  protected onSearchChange(): void {
    this.searchChanges.next();
  }

  protected clearSearch(): void {
    this.search = '';
    this.list.reload();
  }

  /** Entries removed by a (batch) delete. */
  protected removed(uuids: string[]): void {
    this.list.remove((item) => uuids.includes(item.uuid));
  }

  protected startCreate(): void {
    this.editing = 'new';
    this.form = this.emptyForm();
    this.error = '';
  }

  protected startEdit(area: AreaItem): void {
    this.editing = area.uuid;
    this.form = { name: area.name, description: area.description ?? '', color: area.color ?? null, defaultArea: area.defaultArea };
    this.error = '';
  }

  protected cancel(): void {
    this.editing = null;
  }

  protected get editingDefault(): boolean {
    return this.areas.find((area) => area.uuid === this.editing)?.defaultArea ?? false;
  }

  protected save(): void {
    if (!this.form.name.trim() || this.saving) {
      this.error = this.form.name.trim() ? this.error : 'Name ist erforderlich.';
      return;
    }
    const request: AdminAreaRequest = {
      ...this.form,
      name: this.form.name.trim(),
      description: this.form.description?.trim() || null,
    };
    this.saving = true;
    const save$ = this.editing === 'new' ? this.api.createArea(request) : this.api.updateArea(this.editing!, request);
    save$.subscribe({
      next: () => {
        this.saving = false;
        this.editing = null;
        this.load();
      },
      error: () => {
        this.saving = false;
        this.error = 'Speichern fehlgeschlagen. Ist der Name bereits vergeben?';
      },
    });
  }

  protected async remove(area: AreaItem): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Bereich löschen?',
      message:
        `„${area.name}“ wird gelöscht. Einträge, die nur in diesem Bereich sind, wandern in den Standardbereich. ` +
        'Alle Gruppen-Berechtigungen für diesen Bereich werden entfernt.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.deleteArea(area.uuid).subscribe({
      next: () => this.load(),
      error: () => {
        this.error = 'Bereich konnte nicht gelöscht werden.';
      },
    });
  }

  protected load(): void {
    this.error = '';
    this.list.reload();
    // keep sidebar switcher and pickers up to date
    this.areaService.load().subscribe();
  }

  /** The sidebar switcher and the pickers know the areas too. */
  protected refreshSidebar(): void {
    this.areaService.load().subscribe();
  }

  private emptyForm(): AdminAreaRequest {
    return { name: '', description: '', color: COLORS[4], defaultArea: false };
  }
}
