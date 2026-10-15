import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideLayers, LucidePencil, LucidePlus, LucideSave, LucideTrash2, LucideX } from '@lucide/angular';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../../components/list-actions/list-actions';
import { AdminApiService, AdminAreaRequest } from '../../../service/admin-api.service';
import { AreaItem, AreaService } from '../../../service/area.service';

const COLORS = ['#b62f2f', '#d97706', '#15803d', '#0f766e', '#2563eb', '#7c3aed', '#db2777', '#475569'];

@Component({
  selector: 'app-areas-page',
  imports: [ListActions, SelectableRow, SelectionCheckbox, FormsModule, LucideLayers, LucidePencil, LucidePlus, LucideSave, LucideTrash2, LucideX],
  templateUrl: './areas-page.html',
  styleUrl: './areas-page.scss',
})
export class AreasPage implements OnInit {
  protected readonly canBulkDelete = (item: AreaItem) => !item.defaultArea;
  protected readonly bulkDelete = (item: AreaItem) => this.api.deleteArea(item.uuid);
  protected readonly colors = COLORS;
  protected areas: AreaItem[] = [];
  protected loading = false;
  protected saving = false;
  protected error = '';
  /** uuid of the area being edited, 'new' for a new one, null when the editor is closed. */
  protected editing: string | null = null;
  protected form: AdminAreaRequest = this.emptyForm();

  constructor(
    private readonly api: AdminApiService,
    private readonly areaService: AreaService,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.load();
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
    this.loading = true;
    this.api.areas().subscribe({
      next: (areas) => {
        this.areas = areas;
        this.loading = false;
        // keep sidebar switcher and pickers up to date
        this.areaService.load().subscribe();
      },
      error: () => {
        this.error = 'Bereiche konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  private emptyForm(): AdminAreaRequest {
    return { name: '', description: '', color: COLORS[4], defaultArea: false };
  }
}
