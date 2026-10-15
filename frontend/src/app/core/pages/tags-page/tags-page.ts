import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCheck, LucidePlus, LucideSearch, LucideTags, LucideTrash2, LucideX } from '@lucide/angular';
import { Subject, Subscription, debounceTime, map } from 'rxjs';

import { ColorPicker, PRESET_COLORS } from '../../components/color-picker/color-picker';
import { readableTextColor } from '../../components/color-picker/color-utils';
import { ConfirmDialogService } from '../../components/confirm-dialog/confirm-dialog.service';
import { InfiniteScroll } from '../../components/infinite-scroll.directive';
import { ListActions, SelectableRow, SelectionCheckbox } from '../../components/list-actions/list-actions';
import { InventoryApiService, TagItem } from '../../service/inventory-api.service';
import { PermissionService } from '../../service/permission.service';
import { PagedList, SEARCH_DELAY_MS } from '../../util/paged-list';

/** A tag with its usage, as sent by `/tags/page`. */
interface TagUsage extends TagItem {
  assetCount: number;
  assetTypeCount: number;
}

type RowState = 'saving' | 'saved' | 'error';

interface TagRow extends TagItem {
  /** Last saved values, to skip requests without changes and to restore on errors. */
  savedName: string;
  savedColor: string | null;
  state?: RowState;
  assetCount: number;
  typeCount: number;
}

/** Tags are global (not bound to areas); name and color are edited inline and saved right away. */
@Component({
  selector: 'app-tags-page',
  imports: [ListActions, SelectableRow, SelectionCheckbox, FormsModule, ColorPicker, InfiniteScroll, LucideCheck, LucidePlus, LucideSearch, LucideTags, LucideTrash2, LucideX],
  templateUrl: './tags-page.html',
  styleUrl: './tags-page.scss',
})
export class TagsPage implements OnInit, OnDestroy {
  /** Searched on the server, loaded page by page while scrolling. */
  protected readonly list = new PagedList<TagRow>((page, size) =>
    this.api.page<TagUsage>('tags', { q: this.search }, page, size).pipe(
      map((result) => ({ ...result, items: result.items.map((tag) => this.toRow(tag, tag.assetCount, tag.assetTypeCount)) })),
    ),
  );
  protected readonly canBulkDelete = (_row: TagRow) => this.canDelete;
  protected readonly bulkDelete = (row: TagRow) => {
    clearTimeout(this.colorTimers.get(row.uuid));
    return this.api.delete('tags', row.uuid);
  };
  protected search = '';
  protected error = '';
  protected newName = '';
  protected newColor: string | null = PRESET_COLORS[6];
  protected creating = false;

  private readonly colorTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly stateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly searchChanges = new Subject<void>();
  private readonly searchSubscription: Subscription;

  constructor(
    private readonly api: InventoryApiService,
    private readonly permissions: PermissionService,
    private readonly confirmDialog: ConfirmDialogService,
  ) {
    this.searchSubscription = this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.list.reload());
  }

  ngOnInit(): void {
    this.load();
  }

  /** The loaded rows (the list grows while scrolling). */
  protected get rows(): TagRow[] {
    return this.list.items;
  }

  protected set rows(rows: TagRow[]) {
    this.list.items = rows;
  }

  protected onSearchChange(): void {
    this.searchChanges.next();
  }

  protected clearSearch(): void {
    this.search = '';
    this.list.reload();
  }

  /** Rows removed by the batch delete. */
  protected removed(uuids: string[]): void {
    this.list.remove((row) => uuids.includes(row.uuid));
  }

  ngOnDestroy(): void {
    // send color changes that are still waiting for the debounce
    this.colorTimers.forEach((timer, uuid) => {
      clearTimeout(timer);
      const row = this.rows.find((entry) => entry.uuid === uuid);
      if (row) {
        this.persist(row);
      }
    });
    this.stateTimers.forEach((timer) => clearTimeout(timer));
    this.searchSubscription.unsubscribe();
    this.list.destroy();
  }

  /** Same rule as the backend: whoever maintains assets or types may create tags. */
  protected get canCreate(): boolean {
    return (
      this.permissions.can('ASSET_TYPE', 'create') ||
      this.permissions.can('ASSET_TYPE', 'edit') ||
      this.permissions.can('ASSET', 'create') ||
      this.permissions.can('ASSET', 'edit')
    );
  }

  protected get canEdit(): boolean {
    return this.permissions.can('ASSET_TYPE', 'edit');
  }

  protected get canDelete(): boolean {
    return this.permissions.can('ASSET_TYPE', 'delete');
  }

  protected textColor(color: string | null | undefined): string {
    return readableTextColor(color);
  }

  protected create(): void {
    const name = this.newName.trim();
    if (!name || this.creating) {
      return;
    }
    if (this.rows.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
      this.error = `Den Tag „${name}“ gibt es schon.`;
      return;
    }
    this.creating = true;
    this.error = '';
    this.api.create<TagItem>('tags', { name, color: this.newColor }).subscribe({
      next: (tag) => {
        this.rows = this.sort([...this.rows, this.toRow(tag, 0, 0)]);
        this.list.total++;
        this.newName = '';
        this.creating = false;
        this.flash(tag.uuid, 'saved');
      },
      error: () => {
        this.error = 'Tag konnte nicht angelegt werden.';
        this.creating = false;
      },
    });
  }

  protected saveName(row: TagRow): void {
    row.name = row.name.trim();
    if (!row.name) {
      row.name = row.savedName;
      return;
    }
    if (row.name !== row.savedName) {
      this.persist(row);
    }
  }

  /** Dragging in the picker changes the color many times per second; save once it rests. */
  protected colorChanged(row: TagRow, color: string | null): void {
    row.color = color;
    clearTimeout(this.colorTimers.get(row.uuid));
    this.colorTimers.set(
      row.uuid,
      setTimeout(() => {
        this.colorTimers.delete(row.uuid);
        if (row.color !== row.savedColor) {
          this.persist(row);
        }
      }, 500),
    );
  }

  protected async remove(row: TagRow): Promise<void> {
    const usage = row.assetCount + row.typeCount;
    const confirmed = await this.confirmDialog.confirm({
      title: 'Tag löschen?',
      message: usage
        ? `„${row.name}“ wird von ${this.usageText(row)} entfernt. Das kann nicht rückgängig gemacht werden.`
        : `„${row.name}“ wird gelöscht. Das kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.delete('tags', row.uuid).subscribe({
      next: () => this.list.remove((entry) => entry === row),
      error: () => (this.error = `„${row.name}“ konnte nicht gelöscht werden.`),
    });
  }

  protected usageText(row: TagRow): string {
    const parts: string[] = [];
    if (row.assetCount) {
      parts.push(`${row.assetCount} ${row.assetCount === 1 ? 'Asset' : 'Assets'}`);
    }
    if (row.typeCount) {
      parts.push(`${row.typeCount} ${row.typeCount === 1 ? 'Typ' : 'Typen'}`);
    }
    return parts.join(' und ');
  }

  private persist(row: TagRow): void {
    this.setState(row, 'saving');
    this.api.update<TagItem>('tags', row.uuid, { name: row.name, color: row.color ?? null }).subscribe({
      next: (tag) => {
        row.savedName = tag.name;
        row.savedColor = tag.color ?? null;
        this.rows = this.sort(this.rows);
        this.flash(row.uuid, 'saved');
      },
      error: () => {
        row.name = row.savedName;
        row.color = row.savedColor;
        this.flash(row.uuid, 'error');
      },
    });
  }

  private flash(uuid: string, state: RowState): void {
    const row = this.rows.find((entry) => entry.uuid === uuid);
    if (!row) {
      return;
    }
    this.setState(row, state);
    this.stateTimers.set(
      uuid,
      setTimeout(() => (row.state = undefined), state === 'error' ? 4000 : 1500),
    );
  }

  private setState(row: TagRow, state: RowState): void {
    clearTimeout(this.stateTimers.get(row.uuid));
    row.state = state;
  }

  protected load(): void {
    this.error = '';
    this.list.reload();
  }

  private toRow(tag: TagItem, assetCount: number, typeCount: number): TagRow {
    return { ...tag, color: tag.color ?? null, savedName: tag.name, savedColor: tag.color ?? null, assetCount, typeCount };
  }

  private sort(rows: TagRow[]): TagRow[] {
    return [...rows].sort((a, b) => a.savedName.localeCompare(b.savedName));
  }
}
