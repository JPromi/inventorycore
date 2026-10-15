import { Component, Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { LucideCheck, LucideChevronDown, LucideListChecks, LucideMinus, LucideTrash2, LucideX } from '@lucide/angular';
import { Observable, firstValueFrom } from 'rxjs';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.service';
import { DropdownPosition } from '../dropdown-position.directive';
import { TouchSelection } from './touch-selection';

export interface SelectableItem {
  uuid: string;
  name?: string;
  title?: string;
  displayName?: string | null;
  username?: string;
  parentAssetUuid?: string | null;
  parentLocationUuid?: string | null;
}

@Component({
  selector: 'app-list-actions',
  imports: [DropdownPosition, LucideCheck, LucideChevronDown, LucideListChecks, LucideMinus, LucideTrash2, LucideX],
  templateUrl: './list-actions.html', styleUrl: './list-actions.scss',
})
export class ListActions<T extends SelectableItem> implements OnChanges, OnDestroy {
  @Input({ required: true }) items: T[] = [];
  @Input() pageItems?: T[];
  @Input({ required: true }) canDelete!: (item: T) => boolean;
  @Input({ required: true }) deleteItem!: (item: T) => Observable<unknown>;
  @Input() disabled = false;
  @Input() deleteWarning = '';
  @Output() readonly deleted = new EventEmitter<string[]>();
  readonly selected = new Set<string>();
  active = false;
  readonly touch: TouchSelection<T>;
  busy = false;
  protected open = false;
  protected error = '';
  private anchor: string | null = null;
  private destroyed = false;
  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('menu') private menu?: ElementRef<HTMLElement>;

  constructor(private readonly host: ElementRef<HTMLElement>, private readonly confirm: ConfirmDialogService, zone: NgZone) {
    this.touch = new TouchSelection(host.nativeElement.ownerDocument, zone, () => this.items,
      () => this.active && !this.busy && !this.disabled, this.selected);
  }

  ngOnChanges(): void {
    const visible = new Set(this.items.map(item => item.uuid));
    for (const uuid of this.selected) if (!visible.has(uuid)) this.selected.delete(uuid);
    if (this.anchor && !visible.has(this.anchor)) this.anchor = null;
  }

  ngOnDestroy(): void { this.destroyed = true; this.touch.destroy(); }

  protected showMenu(): void {
    this.open = !this.open;
    if (this.open) setTimeout(() => this.menu?.nativeElement.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
  }

  isSelected(item: T): boolean { return this.selected.has(item.uuid); }
  protected toggleMode(): void {
    if (this.busy) return;
    this.active = !this.active;
    this.touch.cancel();
    this.clear();
    this.error = '';
  }
  protected get currentPage(): T[] { return this.pageItems ?? this.items; }
  protected get allSelected(): boolean { return !!this.currentPage.length && this.currentPage.every(item => this.isSelected(item)); }
  protected get partlySelected(): boolean { return !this.allSelected && this.currentPage.some(item => this.isSelected(item)); }
  protected get deletable(): boolean {
    return !!this.selected.size && this.items.filter(item => this.isSelected(item)).every(item => this.canDelete(item));
  }

  toggle(item: T, event: MouseEvent): void {
    event.stopPropagation();
    if (this.touch.suppressClick(event)) { event.preventDefault(); return; }
    if (!this.active || this.busy || this.disabled) return;
    const select = !this.isSelected(item);
    const from = this.items.findIndex(entry => entry.uuid === this.anchor);
    const to = this.items.findIndex(entry => entry.uuid === item.uuid);
    const range = event.shiftKey && from >= 0 && to >= 0
      ? this.items.slice(Math.min(from, to), Math.max(from, to) + 1) : [item];
    for (const entry of range) select ? this.selected.add(entry.uuid) : this.selected.delete(entry.uuid);
    this.anchor = item.uuid;
  }

  protected togglePage(event: Event): void {
    const selected = (event.target as HTMLInputElement).checked;
    for (const item of this.currentPage) selected ? this.selected.add(item.uuid) : this.selected.delete(item.uuid);
    this.anchor = null;
  }

  protected clear(): void { this.selected.clear(); this.anchor = null; this.open = false; }

  protected async remove(): Promise<void> {
    if (this.busy || this.disabled || !this.deletable) return;
    this.open = false;
    this.busy = true;
    const items = this.items.filter(item => this.isSelected(item));
    const deleteItem = this.deleteItem;
    const names = items.slice(0, 5).map(item => this.label(item)).join(', ');
    try {
      const confirmed = await this.confirm.confirm({
        title: `${items.length} Einträge löschen?`,
        message: `${names}${items.length > 5 ? ', ...' : ''}. Das kann nicht rückgängig gemacht werden. ${this.deleteWarning}`.trim(),
        confirmLabel: 'Löschen', danger: true,
      });
      if (!confirmed) return;
      this.error = '';
      const removed: string[] = [];
      const failed: string[] = [];
      // Children first avoids parent/child conflicts in nested assets and locations.
      const byUuid = new Map(items.map(item => [item.uuid, item]));
      const depth = (item: T): number => {
        const seen = new Set<string>();
        let current: T | undefined = item;
        while (current && !seen.has(current.uuid)) {
          seen.add(current.uuid);
          current = byUuid.get(current.parentAssetUuid || current.parentLocationUuid || '');
        }
        return seen.size;
      };
      items.sort((a, b) => depth(b) - depth(a));
      for (const item of items) {
        if (this.destroyed) break;
        try {
          await firstValueFrom(deleteItem(item));
          removed.push(item.uuid);
          this.selected.delete(item.uuid);
        } catch (error: any) {
          const reason = error?.status === 409 ? 'Verknüpfte Einträge vorhanden'
            : error?.status === 403 ? 'Keine Löschberechtigung' : 'Löschen fehlgeschlagen';
          failed.push(`${this.label(item)} (${reason})`);
        }
      }
      if (failed.length) this.error = `${removed.length} gelöscht, ${failed.length} fehlgeschlagen: ${failed.join('; ')}`;
      if (removed.length) this.deleted.emit(removed);
    } finally {
      this.busy = false;
    }
  }

  private label(item: T): string { return item.name || item.title || item.displayName || item.username || 'Eintrag'; }

  @HostListener('document:click', ['$event'])
  protected outside(event: Event): void { if (!this.host.nativeElement.contains(event.target as Node)) this.open = false; }
  @HostListener('document:keydown.escape')
  protected escape(): void {
    if (this.open) { this.open = false; this.trigger?.nativeElement.focus(); }
    else if (this.active && !this.busy) this.toggleMode();
  }
}

@Component({
  selector: 'app-selection-checkbox',
  imports: [LucideCheck],
  host: { '[class.selection-hidden]': '!selection.active', '(click)': '$event.stopPropagation()' },
  template: `<label class="selection-control">
    <input type="checkbox" class="selection-checkbox" [checked]="selection.isSelected(item)"
    [disabled]="selection.busy || selection.disabled" [attr.aria-label]="(item.name || item.title || item.displayName || item.username || 'Eintrag') + ' auswählen'"
    (click)="selection.toggle(item, $event)" />
    <span class="selection-mark" aria-hidden="true">@if (selection.isSelected(item)) { <svg lucideCheck size="14"></svg> }</span>
    </label>`,
})
export class SelectionCheckbox<T extends SelectableItem> {
  @Input({ required: true }) selection!: ListActions<T>;
  @Input({ required: true }) item!: T;
}

/** Capture row clicks before links, buttons, or inline editors can act in selection mode. */
@Directive({ selector: '[appSelectableRow]' })
export class SelectableRow<T extends SelectableItem> implements OnInit, OnDestroy {
  @Input({ required: true }) appSelectableRow!: ListActions<T>;
  @Input({ required: true }) selectionItem!: T;
  @HostBinding('class.selecting') get selecting(): boolean { return this.appSelectableRow.active; }

  private readonly click = (event: MouseEvent) => {
    if (!this.appSelectableRow.active || (event.target as HTMLElement).closest('app-selection-checkbox')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.appSelectableRow.toggle(this.selectionItem, event);
  };
  private readonly pointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' && this.appSelectableRow.active && !(event.target as HTMLElement).closest('app-selection-checkbox')) event.preventDefault();
  };
  private readonly touchStart = (event: TouchEvent) => this.appSelectableRow.touch.start(this.selectionItem, event, this.element.nativeElement);
  private readonly contextMenu = (event: Event) => { if (this.appSelectableRow.active) event.preventDefault(); };

  constructor(private readonly element: ElementRef<HTMLElement>) {
    this.element.nativeElement.addEventListener('click', this.click, true);
    this.element.nativeElement.addEventListener('pointerdown', this.pointerDown, true);
    this.element.nativeElement.addEventListener('touchstart', this.touchStart, { passive: true });
    this.element.nativeElement.addEventListener('contextmenu', this.contextMenu);
  }

  ngOnInit(): void { this.appSelectableRow.touch.register(this.element.nativeElement, () => this.selectionItem); }

  ngOnDestroy(): void {
    this.element.nativeElement.removeEventListener('click', this.click, true);
    this.element.nativeElement.removeEventListener('pointerdown', this.pointerDown, true);
    this.element.nativeElement.removeEventListener('touchstart', this.touchStart);
    this.element.nativeElement.removeEventListener('contextmenu', this.contextMenu);
    this.appSelectableRow.touch.unregister(this.element.nativeElement);
  }
}
