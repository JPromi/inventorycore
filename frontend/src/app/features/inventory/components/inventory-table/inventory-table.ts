import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, forkJoin, from, map, mergeMap, of, toArray } from 'rxjs';
import {
  LucidePlus,
  LucideSave,
  LucideX,
  LucideUndo2,
  LucideArrowDown,
  LucideTrash2,
} from '@lucide/angular';
import { PermissionResourceType } from '../../../../core/entities/user.entity';
import { AreaService } from '../../../../core/service/area.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { LOCATION_TYPES } from '../../../../shared/util/location-types';
import { SearchSelect } from '../../../../shared/components/search-select/search-select';
import { MultiSelect } from '../../../../shared/components/multi-select/multi-select';
import { fieldOptions } from '../../../inspections/data-access/inspection.service';
import {
  InventoryApiService,
  InventoryItem,
  InventoryRequest,
  CustomFieldDefinition,
  CustomFieldValue,
  ASSET_INSPECTION_POLICIES,
} from '../../data-access/inventory-api.service';
import { inventoryRequest, parseTableText, tableText } from './table-data';

/**
 * Field columns are joined by the shown name, not the stored key: a renamed type field keeps its
 * old key, so "Marke" renamed to "Hersteller" must share the column of other "Hersteller" fields.
 */
function fieldId(name: string): string {
  return name.trim().toLocaleLowerCase();
}

interface Option {
  value: string;
  label: string;
}
interface Column {
  key: string;
  label: string;
  kind?: 'number' | 'select' | 'multi';
  options?: Option[];
}
interface Row {
  key: number;
  uuid?: string;
  cells: Record<string, string>;
  initial: Record<string, string>;
  saved: boolean;
  uncertain?: boolean;
  error: string;
  customFields: Record<string, string>;
  storedFields: Record<string, string>;
  originalTypeUuid?: string | null;
}
interface Cell {
  row: number;
  col: number;
}
interface Change {
  row: Row;
  key: string;
  before: string;
  after: string;
}

@Component({
  selector: 'app-inventory-table',
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    SearchSelect,
    MultiSelect,
    LucidePlus,
    LucideSave,
    LucideX,
    LucideUndo2,
    LucideArrowDown,
    LucideTrash2,
  ],
  templateUrl: './inventory-table.html',
  styleUrl: './inventory-table.scss',
})
export class InventoryTable implements AfterViewInit, OnDestroy {
  @Input({ required: true }) endpoint = '';
  @Input({ required: true }) resourceType!: PermissionResourceType;
  /** null creates new rows; an array edits the selected entries. */
  @Input() items: InventoryItem[] | null = null;
  @Output() readonly closed = new EventEmitter<boolean>();
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('sheet') private sheet?: ElementRef<HTMLElement>;
  private readonly api = inject(InventoryApiService);
  private readonly permissions = inject(PermissionService);
  private readonly areas = inject(AreaService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  readonly maxRows = 200;
  columns: Column[] = [];
  private baseColumns: Column[] = [];
  rows: Row[] = [];
  loading = true;
  saving = false;
  error = '';
  discard = false;
  addCount = 10;
  savedCount = 0;
  private nextKey = 0;
  private changedServer = false;
  private destroyed = false;
  private types: InventoryItem[] = [];
  private history: Change[][] = [];
  private readonly multiCache = new WeakMap<
    Row,
    Map<string, { source: string; values: string[] }>
  >();
  selection: { start: Cell; end: Cell } | null = null;
  private drag: { source: Cell; end: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private animation = 0;
  readonly columnWidths: Record<string, number> = {};
  private resizing: { key: string; x: number; width: number } | null = null;

  get tableWidth(): number {
    return 248 + this.columns.reduce((sum, column) => sum + this.columnWidth(column.key), 0);
  }

  columnWidth(key: string): number {
    return this.columnWidths[key] ?? 192;
  }

  startResize(event: PointerEvent, key: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizing = { key, x: event.clientX, width: this.columnWidth(key) };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  resizeColumn(event: PointerEvent): void {
    if (!this.resizing) return;
    const { key, x, width } = this.resizing;
    this.columnWidths[key] = Math.max(112, Math.min(1000, width + event.clientX - x));
  }

  endResize(): void {
    this.resizing = null;
  }

  resizeKey(event: KeyboardEvent, key: string): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    this.columnWidths[key] = event.key === 'Home' ? 192 : Math.max(112,
      Math.min(1000, this.columnWidth(key) + (event.key === 'ArrowRight' ? 16 : -16)));
  }

  get dirty(): boolean {
    return this.rows.some((row) => !row.saved && this.isChanged(row));
  }
  get canUndo(): boolean {
    return !!this.history.length && !this.saving;
  }
  get pending(): number {
    return this.rows.filter((row) => !row.saved && !row.uncertain && this.isChanged(row)).length;
  }

  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal();
    this.dialog.nativeElement.addEventListener('keydown', this.captureGridKeys, true);
    this.initialize();
  }

  /** Grid range shortcuts run before a dropdown trigger can open its panel. */
  private readonly captureGridKeys = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    if (!target.closest('td') || target.closest('.panel')) return;
    if (
      (event.shiftKey && event.key.startsWith('Arrow')) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd')
    ) {
      event.stopPropagation();
      this.keydown(event);
    }
  };

  private refreshColumns(): void {
    if (this.endpoint !== 'assets') return;
    const definitions = new Map<string, string>();
    const active = new Set(this.rows.map((row) => row.cells['assetTypeUuid']).filter(Boolean));
    this.types
      .filter((type) => active.has(type.uuid))
      .forEach((type) =>
        [...(type.fieldDefinitions ?? [])]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach((field) => {
            if (!definitions.has(fieldId(field.name))) definitions.set(fieldId(field.name), field.name);
          }),
      );
    for (const row of this.rows) {
      for (const [key, name] of Object.entries(row.customFields)) {
        if (!definitions.has(key)) definitions.set(key, name);
      }
      if (row.cells['assetTypeUuid'] === row.originalTypeUuid) {
        for (const [key, name] of Object.entries(row.storedFields)) {
          if (!definitions.has(key)) definitions.set(key, name);
        }
      }
    }
    const columns = [
      ...this.baseColumns,
      ...[...definitions].map(([key, label]) => ({ key: 'field:' + key, label })),
    ];
    for (const row of this.rows)
      for (const column of columns) {
        row.cells[column.key] ??= '';
        row.initial[column.key] ??= '';
      }
    if (
      columns.map((column) => column.key).join('|') !==
      this.columns.map((column) => column.key).join('|')
    ) {
      const startKey = this.selection ? this.columns[this.selection.start.col]?.key : undefined;
      const endKey = this.selection ? this.columns[this.selection.end.col]?.key : undefined;
      const start = columns.findIndex((column) => column.key === startKey);
      const end = columns.findIndex((column) => column.key === endKey);
      this.cancelFill();
      this.selection =
        this.selection && start >= 0 && end >= 0
          ? {
              start: { ...this.selection.start, col: start },
              end: { ...this.selection.end, col: end },
            }
          : null;
    }
    this.columns = columns;
  }

  private definition(
    row: Row,
    column: Column,
    typeUuid = row.cells['assetTypeUuid'],
  ): CustomFieldDefinition | undefined {
    return this.types
      .find((type) => type.uuid === typeUuid)
      ?.fieldDefinitions?.find((field) => column.key === 'field:' + fieldId(field.name));
  }

  /** Column id of a stored value: the type may have renamed the field since it was saved. */
  private valueId(field: CustomFieldValue, typeUuid?: string | null): string {
    const definition = field.customAssetField
      ? undefined
      : this.types
          .find((type) => type.uuid === typeUuid)
          ?.fieldDefinitions?.find(
            (definition) =>
              (definition.fieldKey ?? definition.name) === (field.fieldKey ?? field.name),
          );
    return fieldId(definition?.name ?? field.name);
  }

  applies(row: Row, column: Column, typeUuid = row.cells['assetTypeUuid']): boolean {
    if (!column.key.startsWith('field:')) return true;
    const key = column.key.slice(6);
    return (
      !!row.customFields[key] ||
      !!this.definition(row, column, typeUuid) ||
      (typeUuid === row.originalTypeUuid && !!row.storedFields[key])
    );
  }

  isSelect(row: Row, column: Column): boolean {
    return (
      column.kind === 'select' ||
      ['SELECT', 'BOOLEAN'].includes(this.definition(row, column)?.fieldType ?? '')
    );
  }

  optionsFor(row: Row, column: Column): Option[] {
    const definition = this.definition(row, column);
    if (definition?.fieldType === 'SELECT')
      return fieldOptions(definition).map((value) => ({ value, label: value }));
    if (definition?.fieldType === 'BOOLEAN')
      return [
        { value: 'true', label: t('common.yes') },
        { value: 'false', label: t('common.no') },
      ];
    const options = column.options ?? [];
    const values =
      column.kind === 'multi' ? this.multiValues(row, column) : [row.cells[column.key]];
    const missing = values.filter(
      (value) => !!value && !options.some((option) => option.value === value),
    );
    return missing.length
      ? [...options, ...missing.map((value) => ({ value, label: value }))]
      : options;
  }

  multiValues(row: Row, column: Column): string[] {
    let cache = this.multiCache.get(row);
    if (!cache) {
      cache = new Map();
      this.multiCache.set(row, cache);
    }
    const source = row.cells[column.key] ?? '';
    const current = cache.get(column.key);
    if (current?.source === source) return current.values;
    const values = source
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean);
    cache.set(column.key, { source, values });
    return values;
  }

  setMulti(row: Row, column: Column, values: string[]): void {
    this.set(row, column, values.join('; '));
  }

  lockedOptions(row: Row, column: Column): Option[] {
    if (column.key === 'tagUuids')
      return (
        this.types
          .find((type) => type.uuid === row.cells['assetTypeUuid'])
          ?.tags?.map((tag) => ({ value: tag.uuid, label: tag.name })) ?? []
      );
    if (column.key === 'areaUuids' && row.uuid)
      return this.multiValues(row, column)
        .filter(
          (uuid) =>
            row.initial[column.key]
              ?.split(';')
              .map((value) => value.trim())
              .includes(uuid) && !this.permissions.can(this.resourceType, 'edit', [uuid]),
        )
        .map((value) => ({
          value,
          label: column.options?.find((option) => option.value === value)?.label ?? value,
        }));
    return [];
  }

  private async initialize(): Promise<void> {
    try {
      if ((this.items?.length ?? 0) > this.maxRows)
        throw new Error(t('inventoryTable.limit', { count: this.maxRows }));
      const data = await firstValueFrom(
        forkJoin({
          areas: this.areas.load(),
          types: this.endpoint === 'assets' ? this.api.list<InventoryItem>('asset-types') : of([]),
          locations:
            this.endpoint === 'assets' || this.endpoint === 'locations'
              ? this.api.list<InventoryItem>('locations')
              : of([]),
          tags: this.endpoint !== 'locations' ? this.api.list<InventoryItem>('tags') : of([]),
          items: this.items?.length
            ? from(this.items.map((item, index) => ({ item, index }))).pipe(
                mergeMap(
                  ({ item, index }) =>
                    this.api
                      .get<InventoryItem>(this.endpoint, item.uuid)
                      .pipe(map((item) => ({ item, index }))),
                  4,
                ),
                toArray(),
                map((items) => items.sort((a, b) => a.index - b.index).map((entry) => entry.item)),
              )
            : of([]),
        }).pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (this.destroyed) return;
      if (!data.areas.length) throw new Error(t('inventoryTable.loadError'));
      if (
        data.items.some(
          (item) => !this.permissions.can(this.resourceType, 'edit', item.areaUuids ?? []),
        )
      ) {
        throw new Error(t('inventoryTable.noPermission'));
      }
      this.types = data.types;
      const options = (items: { uuid: string; name: string }[]) =>
        items.map((item) => ({ value: item.uuid, label: item.name }));
      this.columns = [
        { key: 'name', label: t('common.name') },
        { key: 'description', label: t('common.description') },
      ];
      if (this.endpoint === 'assets')
        this.columns.push(
          { key: 'serialNumber', label: t('terms.serialNumber') },
          { key: 'inventoryNumber', label: t('terms.inventoryNumber') },
          {
            key: 'assetTypeUuid',
            label: t('terms.assetType'),
            kind: 'select',
            options: options(data.types),
          },
          {
            key: 'locationUuid',
            label: t('terms.location'),
            kind: 'select',
            options: options(data.locations),
          },
          {
            key: 'inspectionPolicy',
            label: t('inventoryTable.policy'),
            kind: 'select',
            options: Object.entries(ASSET_INSPECTION_POLICIES).map(([value, label]) => ({
              value,
              label,
            })),
          },
        );
      if (this.endpoint === 'locations')
        this.columns.push(
          {
            key: 'locationType',
            label: t('inventoryTable.locationType'),
            kind: 'select',
            options: LOCATION_TYPES.map((item) => ({ value: item.value, label: item.label })),
          },
          {
            key: 'parentLocationUuid',
            label: t('inventoryTable.parentLocation'),
            kind: 'select',
            options: options(data.locations),
          },
          { key: 'street', label: t('inventoryTable.street') },
          { key: 'postalCode', label: t('inventoryTable.postalCode') },
          { key: 'city', label: t('inventoryTable.city') },
          { key: 'country', label: t('inventoryTable.country') },
        );
      if (this.endpoint !== 'locations')
        this.columns.push({
          key: 'tagUuids',
          label: t('inventoryTable.tags'),
          kind: 'multi',
          options: options(data.tags),
        });
      this.columns.push({
        key: 'areaUuids',
        label: t('inventoryTable.areas'),
        kind: 'multi',
        options: options(data.areas),
      });
      this.baseColumns = [...this.columns];
      if (this.items === null) this.addRows();
      else this.rows = data.items.map((item) => this.rowFromItem(item));
      this.refreshColumns();
    } catch (error) {
      if (!this.destroyed)
        this.error = error instanceof Error ? error.message : t('inventoryTable.loadError');
    } finally {
      this.loading = false;
    }
  }

  private rowFromItem(item: InventoryItem): Row {
    const request = this.requestOf(item);
    const cells: Record<string, string> = {};
    const names = (fields: CustomFieldValue[]) =>
      Object.fromEntries(
        fields.map((field) => [this.valueId(field, item.assetTypeUuid), field.name] as const),
      );
    for (const column of this.columns) {
      if (column.key.startsWith('field:')) cells[column.key] = '';
      else if (column.kind === 'multi')
        cells[column.key] = (
          (request[column.key as keyof InventoryRequest] as string[]) ?? []
        ).join('; ');
      else cells[column.key] = String(request[column.key as keyof InventoryRequest] ?? '');
    }
    for (const field of item.fieldValues ?? [])
      cells['field:' + this.valueId(field, item.assetTypeUuid)] = field.value ?? '';
    return {
      key: this.nextKey++,
      uuid: item.uuid,
      cells,
      initial: { ...cells },
      saved: false,
      error: '',
      customFields: names((item.fieldValues ?? []).filter((field) => field.customAssetField)),
      storedFields: names(item.fieldValues ?? []),
      originalTypeUuid: item.assetTypeUuid,
    };
  }

  private requestOf(item: InventoryItem): InventoryRequest {
    const inherited =
      this.endpoint === 'assets'
        ? (this.types
            .find((type) => type.uuid === item.assetTypeUuid)
            ?.tags?.map((tag) => tag.uuid) ?? [])
        : [];
    return inventoryRequest(item, inherited);
  }

  addRows(): void {
    const count = Number(this.addCount);
    if (!Number.isInteger(count) || count < 1 || this.rows.length + count > this.maxRows) {
      this.error = t('inventoryTable.limit', { count: this.maxRows });
      return;
    }
    const allowed = this.areas.areas.filter((area) =>
      this.permissions.can(this.resourceType, 'create', [area.uuid]),
    );
    const area =
      allowed.find((area) => this.areas.selected.includes(area.uuid)) ??
      allowed.find((area) => area.defaultArea) ??
      allowed[0];
    for (let i = 0; i < count; i++) {
      const cells = Object.fromEntries(this.columns.map((column) => [column.key, '']));
      cells['inspectionPolicy'] = 'STANDARD';
      cells['locationType'] = 'OTHER';
      cells['areaUuids'] = area?.uuid ?? '';
      this.rows.push({
        key: this.nextKey++,
        cells,
        initial: { ...cells },
        saved: false,
        error: '',
        customFields: {},
        storedFields: {},
      });
    }
    this.error = '';
    this.refreshColumns();
  }

  remove(row: Row): void {
    if (this.saving || row.saved || row.uncertain) return;
    this.rows = this.rows.filter((item) => item !== row);
    this.selection = null;
    this.history = [];
    this.refreshColumns();
  }

  isChanged(row: Row): boolean {
    return this.columns.some(
      (column) => this.applies(row, column) && row.cells[column.key] !== row.initial[column.key],
    );
  }

  select(row: number, col: number, event?: MouseEvent): void {
    if (this.drag) return;
    const cell = { row, col };
    this.selection =
      event?.shiftKey && this.selection
        ? { start: this.selection.start, end: cell }
        : { start: cell, end: cell };
  }

  focusCell(row: number, col: number): void {
    if (!this.selected(row, col)) this.select(row, col);
  }

  selected(row: number, col: number): boolean {
    const range = this.selection;
    return (
      !!range &&
      row >= Math.min(range.start.row, range.end.row) &&
      row <= Math.max(range.start.row, range.end.row) &&
      col >= Math.min(range.start.col, range.end.col) &&
      col <= Math.max(range.start.col, range.end.col)
    );
  }

  set(row: Row, column: Column, value: string | null): void {
    this.apply([{ row, key: column.key, before: row.cells[column.key], after: value ?? '' }]);
  }

  private apply(changes: Change[]): void {
    const typeChanges = new Map(
      changes
        .filter((change) => change.key === 'assetTypeUuid')
        .map((change) => [change.row, change.after]),
    );
    const valid = changes.filter(
      (change) =>
        !change.row.saved &&
        !change.row.uncertain &&
        change.before !== change.after &&
        this.applies(
          change.row,
          { key: change.key, label: '' },
          typeChanges.get(change.row) ?? change.row.cells['assetTypeUuid'],
        ),
    );
    if (!valid.length || this.saving) return;
    valid.forEach((change) => {
      change.row.cells[change.key] = change.after;
      change.row.error = '';
    });
    this.history.push(valid);
    if (this.history.length > 100) this.history.shift();
    if (valid.some((change) => change.key === 'assetTypeUuid')) this.refreshColumns();
  }

  undo(): void {
    if (!this.canUndo) return;
    this.history.pop()!.forEach((change) => {
      change.row.cells[change.key] = change.before;
      change.row.error = '';
    });
    this.refreshColumns();
  }

  fillDown(): void {
    if (!this.selection || this.saving) return;
    const { start, end } = this.selection;
    const top = Math.min(start.row, end.row),
      bottom = Math.max(start.row, end.row);
    const changes: Change[] = [];
    for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) {
      if (!this.applies(this.rows[top], this.columns[col])) continue;
      const key = this.columns[col].key;
      for (let row = top + 1; row <= bottom; row++)
        changes.push({
          row: this.rows[row],
          key,
          before: this.rows[row].cells[key],
          after: this.rows[top].cells[key],
        });
    }
    this.apply(changes);
  }

  startFill(event: PointerEvent, row: number, col: number): void {
    if (this.saving || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = { source: { row, col }, end: row };
    this.selection = { start: { row, col }, end: { row, col } };
    this.pointer = { x: event.clientX, y: event.clientY };
    this.zone.runOutsideAngular(
      () => (this.animation = requestAnimationFrame(() => this.autoScroll())),
    );
  }

  @HostListener('document:pointermove', ['$event'])
  move(event: PointerEvent): void {
    if (!this.drag) return;
    event.preventDefault();
    this.pointer = { x: event.clientX, y: event.clientY };
    this.updateDrag();
  }

  private updateDrag(): void {
    if (!this.pointer || !this.drag) return;
    const bounds = this.sheet?.nativeElement.getBoundingClientRect();
    const x = bounds
      ? Math.max(bounds.left + 1, Math.min(bounds.right - 2, this.pointer.x))
      : this.pointer.x;
    const y = bounds
      ? Math.max(bounds.top + 1, Math.min(bounds.bottom - 2, this.pointer.y))
      : this.pointer.y;
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-row]');
    if (!cell || !this.dialog.nativeElement.contains(cell)) return;
    const end = Number(cell.dataset['row']);
    if (end < this.drag.source.row || end === this.drag.end) return;
    this.zone.run(() => {
      this.drag!.end = end;
      this.selection = { start: this.drag!.source, end: { row: end, col: this.drag!.source.col } };
    });
  }

  private autoScroll(): void {
    if (!this.drag || !this.pointer || !this.sheet) return;
    const box = this.sheet.nativeElement.getBoundingClientRect();
    const y = this.pointer.y;
    if (y > box.bottom - 35) this.sheet.nativeElement.scrollTop += 12;
    else if (y < box.top + 35) this.sheet.nativeElement.scrollTop -= 12;
    this.updateDrag();
    this.animation = requestAnimationFrame(() => this.autoScroll());
  }

  @HostListener('document:pointerup')
  endFill(): void {
    if (!this.drag) return;
    this.fillDown();
    this.cancelFill();
  }

  @HostListener('document:pointercancel')
  cancelFill(): void {
    this.drag = null;
    this.pointer = null;
    cancelAnimationFrame(this.animation);
  }

  keydown(event: KeyboardEvent): void {
    if ((event.target as HTMLElement).closest('.panel')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.fillDown();
    }
    if (event.shiftKey && event.key.startsWith('Arrow') && this.selection) {
      event.preventDefault();
      const { end } = this.selection;
      const row = Math.min(
        this.rows.length - 1,
        Math.max(0, end.row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)),
      );
      const col = Math.min(
        this.columns.length - 1,
        Math.max(
          0,
          end.col + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
        ),
      );
      this.selection = { start: this.selection.start, end: { row, col } };
    }
  }

  copy(event: ClipboardEvent): void {
    if ((event.target as HTMLElement).closest('.panel')) return;
    if (!this.selection) return;
    const { start, end } = this.selection;
    if (start.row === end.row && start.col === end.col) return;
    event.preventDefault();
    const values: string[][] = [];
    for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
      values.push(
        this.columns
          .slice(Math.min(start.col, end.col), Math.max(start.col, end.col) + 1)
          .map((column) => {
            const value = this.rows[r].cells[column.key];
            if (!this.applies(this.rows[r], column)) return '';
            if (column.kind === 'multi')
              return this.labels(this.multiValues(this.rows[r], column), column).join('; ');
            return this.isSelect(this.rows[r], column)
              ? (this.optionsFor(this.rows[r], column).find((option) => option.value === value)
                  ?.label ?? value)
              : value;
          }),
      );
    }
    event.clipboardData?.setData('text/plain', tableText(values));
  }

  paste(event: ClipboardEvent, row: number, col: number): void {
    const text = event.clipboardData?.getData('text/plain');
    if (text == null || this.saving) return;
    if ((event.target as HTMLElement).closest('.panel')) return;
    if (!/[\t\r\n]/.test(text) && !this.isSelect(this.rows[row], this.columns[col])) return;
    event.preventDefault();
    try {
      const values = parseTableText(text);
      if (
        !values.length ||
        row + values.length > this.maxRows ||
        values.some((value) => col + value.length > this.columns.length)
      )
        throw new Error(t('inventoryTable.pasteSize'));
      if (row + values.length > this.rows.length) {
        if (this.items !== null) throw new Error(t('inventoryTable.pasteSize'));
        const previous = this.addCount;
        this.addCount = row + values.length - this.rows.length;
        this.addRows();
        this.addCount = previous;
      }
      const changes: Change[] = [];
      values.forEach((cells, ri) =>
        cells.forEach((value, ci) => {
          const column = this.columns[col + ci];
          if (this.isSelect(this.rows[row + ri], column) && value)
            value = this.optionValue(value, {
              ...column,
              options: this.optionsFor(this.rows[row + ri], column),
            });
          if (column.kind === 'multi')
            value = value
              .split(';')
              .map((value) => value.trim())
              .filter(Boolean)
              .map((value) => this.optionValue(value, column))
              .join('; ');
          changes.push({
            row: this.rows[row + ri],
            key: column.key,
            before: this.rows[row + ri].cells[column.key],
            after: value,
          });
        }),
      );
      this.apply(changes);
      this.selection = {
        start: { row, col },
        end: {
          row: row + values.length - 1,
          col: col + Math.max(...values.map((value) => value.length)) - 1,
        },
      };
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : t('inventoryTable.pasteError');
    }
  }

  private optionValue(value: string, column: Column): string {
    const matches =
      column.options?.filter((option) => option.value === value || option.label === value.trim()) ??
      [];
    if (matches.length !== 1)
      throw new Error(t('inventoryTable.unknownOption', { value, field: column.label }));
    return matches[0].value;
  }

  private labels(values: string[], column: Column): string[] {
    return values.map(
      (value) => column.options?.find((option) => option.value === value)?.label ?? value,
    );
  }

  private merge(row: Row, current?: InventoryItem): InventoryRequest {
    const request: InventoryRequest = current
      ? this.requestOf(current)
      : {
          name: '',
          images: [],
          fieldValues: [],
          fieldDefinitions: [],
          tagUuids: [],
          areaUuids: [],
        };
    const changed = this.columns.filter(
      (column) =>
        this.applies(row, column) &&
        (!current || row.cells[column.key] !== row.initial[column.key]),
    );
    for (const column of changed) {
      const value = row.cells[column.key];
      if (column.key.startsWith('field:')) {
        const key = column.key.slice(6);
        const field = request.fieldValues?.find(
          (field) => this.valueId(field, current?.assetTypeUuid) === key,
        );
        if (field) field.value = value;
        else if (value) {
          const definition = this.definition(row, column);
          request.fieldValues!.push({
            fieldKey: definition?.fieldKey ?? null,
            name: definition?.name ?? column.label,
            value,
            customAssetField: !definition,
          });
        }
      } else if (column.kind === 'multi') {
        const values = value
          .split(';')
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => this.optionValue(value, column));
        if (column.key === 'areaUuids') {
          const original = current?.areaUuids ?? [];
          const action = current ? 'edit' : 'create';
          if (
            values.some(
              (uuid) =>
                !original.includes(uuid) &&
                !this.permissions.can(this.resourceType, action, [uuid]),
            ) ||
            original.some(
              (uuid) =>
                !values.includes(uuid) && !this.permissions.can(this.resourceType, 'edit', [uuid]),
            )
          )
            throw new Error(t('inventoryTable.noPermission'));
        }
        Object.assign(request, { [column.key]: [...new Set(values)] });
      } else Object.assign(request, { [column.key]: value || null });
    }
    request.name = request.name?.trim() ?? '';
    if (!request.name || request.name.length > 255)
      throw new Error(t('inventoryTable.nameRequired'));
    if (!request.areaUuids?.length) throw new Error(t('inventoryTable.areaRequired'));
    if (this.endpoint === 'assets') {
      request.inspectionPolicy ??= 'STANDARD';
      const type = this.types.find((type) => type.uuid === request.assetTypeUuid);
      const inherited = new Set(type?.tags?.map((tag) => tag.uuid) ?? []);
      request.tagUuids = request.tagUuids?.filter((uuid) => !inherited.has(uuid));
      if (current && current.assetTypeUuid !== request.assetTypeUuid) {
        // values move to the new type's field of the same name, whatever key either side has
        request.fieldValues =
          request.fieldValues?.flatMap((field) => {
            if (field.customAssetField) return [field];
            const id = this.valueId(field, current.assetTypeUuid);
            const definition = type?.fieldDefinitions?.find(
              (definition) => fieldId(definition.name) === id,
            );
            return definition
              ? [{ ...field, fieldKey: definition.fieldKey, name: definition.name }]
              : [];
          }) ?? [];
      }
      for (const definition of type?.fieldDefinitions ?? []) {
        const field = request.fieldValues?.find(
          (field) => (field.fieldKey ?? field.name) === (definition.fieldKey ?? definition.name),
        );
        if (definition.required && !field?.value?.trim())
          throw new Error(t('inventoryTable.requiredField', { field: definition.name }));
        if (
          field?.value &&
          definition.fieldType === 'NUMBER' &&
          !Number.isFinite(Number(field.value))
        )
          throw new Error(t('inventoryTable.invalidField', { field: definition.name }));
        if (field?.value && definition.fieldType === 'SELECT') {
          let options: string[] = [];
          try {
            options = JSON.parse(definition.optionsJson || '[]');
          } catch {
            /* Invalid definitions cannot supply choices. */
          }
          if (!options.includes(field.value))
            throw new Error(t('inventoryTable.invalidField', { field: definition.name }));
        }
      }
    }
    return request;
  }

  async save(): Promise<void> {
    if (this.saving || this.loading) return;
    const pending = this.rows.filter((row) => !row.saved && !row.uncertain && this.isChanged(row));
    if (!pending.length) return;
    this.saving = true;
    this.error = '';
    this.cancelFill();
    for (const row of pending) {
      if (this.destroyed) break;
      try {
        // Fetch current details again: unrelated fields changed since opening are retained.
        const current = row.uuid
          ? await firstValueFrom(
              this.api
                .get<InventoryItem>(this.endpoint, row.uuid)
                .pipe(takeUntilDestroyed(this.destroyRef)),
            )
          : undefined;
        if (current && !this.permissions.can(this.resourceType, 'edit', current.areaUuids ?? []))
          throw new Error(t('inventoryTable.noPermission'));
        if (!current && !this.permissions.can(this.resourceType, 'create'))
          throw new Error(t('inventoryTable.noPermission'));
        const request = this.merge(row, current);
        const result = await firstValueFrom(
          (row.uuid
            ? this.api.update(this.endpoint, row.uuid, request)
            : this.api.create(this.endpoint, request)
          ).pipe(takeUntilDestroyed(this.destroyRef)),
        );
        row.uuid = result.uuid;
        const persisted = this.rowFromItem(result);
        row.cells = persisted.cells;
        row.initial = persisted.initial;
        row.customFields = persisted.customFields;
        row.storedFields = persisted.storedFields;
        row.originalTypeUuid = persisted.originalTypeUuid;
        row.saved = true;
        row.error = '';
        this.savedCount++;
        this.changedServer = true;
      } catch (error) {
        if (!this.destroyed) {
          const status = (error as { status?: number })?.status;
          if (status === 0 && !row.uuid) {
            row.uncertain = true;
            row.error = t('inventoryTable.uncertain');
            this.changedServer = true;
            continue;
          }
          row.error =
            status === 409
              ? t('inventoryTable.conflict')
              : status === 403
                ? t('inventoryTable.noPermission')
                : error instanceof Error
                  ? error.message
                  : t('inventoryTable.saveError');
        }
      }
    }
    this.saving = false;
    this.history = [];
    this.refreshColumns();
  }

  close(force = false): void {
    if (this.saving) return;
    this.cancelFill();
    if (this.dirty && !force) {
      this.discard = true;
      return;
    }
    this.dialog.nativeElement.close();
    this.closed.emit(this.changedServer);
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty || this.saving) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  ngOnDestroy(): void {
    this.dialog.nativeElement.removeEventListener('keydown', this.captureGridKeys, true);
    this.destroyed = true;
    this.cancelFill();
    this.dialog.nativeElement.close();
  }
}
