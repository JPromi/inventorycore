import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCamera,
  LucideCameraOff,
  LucideCheck,
  LucideChevronDown,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideClipboardCheck,
  LucideCornerDownLeft,
  LucideLock,
  LucidePrinter,
  LucideScanBarcode,
  LucideSearch,
  LucideTrash2,
  LucideTriangleAlert,
  LucideWrench,
  LucideX,
} from '@lucide/angular';

import { Observable, forkJoin, of } from 'rxjs';
import { catchError, filter, map, switchMap } from 'rxjs/operators';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { SearchSelect, SelectOption } from '../../../components/search-select/search-select';
import { CameraView } from '../../../components/camera-view/camera-view';
import { InspectionItemEditor } from '../inspection-item-editor/inspection-item-editor';
import { CameraScanner } from '../../../scan/camera-scanner';
import { scanFeedback } from '../../../scan/scan-feedback';
import {
  InspectionCondition,
  InspectionDetail,
  InspectionField,
  InspectionItem,
  InspectionItemStatus,
  InspectionPhoto,
  InspectionPhotoTarget,
  InspectionScanResponse,
  InspectionService,
  fieldOptions,
  formatCheckValue,
} from '../../../service/inspection.service';
import { AreaService } from '../../../service/area.service';
import { FileApiService } from '../../../service/file-api.service';
import { InventoryApiService, InventoryItem } from '../../../service/inventory-api.service';
import { PermissionService } from '../../../service/permission.service';

/** DEFECT: present but broken (inventory with function check). */
type ItemFilter = 'ALL' | InspectionItemStatus | 'DEFECT';

/** Same code from the camera is ignored for this long. */
const DUPLICATE_WINDOW_MS = 2500;

/**
 * Doing an inspection (scan or check by hand, fill the check fields) and, once completed,
 * the read-only protocol.
 */
@Component({
  selector: 'app-inspection-page',
  imports: [
    CameraView,
    InspectionItemEditor,
    DatePipe,
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    SearchSelect,
    LucideArrowLeft,
    LucideCamera,
    LucideCameraOff,
    LucideCheck,
    LucideChevronDown,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideClipboardCheck,
    LucideCornerDownLeft,
    LucideLock,
    LucidePrinter,
    LucideScanBarcode,
    LucideSearch,
    LucideTrash2,
    LucideTriangleAlert,
    LucideWrench,
    LucideX,
  ],
  templateUrl: './inspection-page.html',
  styleUrl: './inspection-page.scss',
})
export class InspectionPage implements OnInit, OnDestroy {
  @ViewChild('scanInput') private scanInput?: ElementRef<HTMLInputElement>;
  @ViewChild(CameraView) private camera?: CameraView;

  protected readonly formatValue = formatCheckValue;
  protected readonly options = fieldOptions;
  protected readonly cameraAvailable = CameraScanner.available;

  protected uuid = '';
  protected detail: InspectionDetail | null = null;
  protected loading = false;
  protected error = '';

  protected code = '';
  protected scanning = false;
  protected lastScan: InspectionScanResponse | null = null;
  protected cameraOn = false;
  /** Result popup over the full-screen camera. */
  protected sheetOpen = false;
  /** The full-screen camera takes a photo for this item instead of scanning. */
  protected photoTarget: { itemUuid: string; target: InspectionPhotoTarget } | null = null;
  /** Upload state or result of the last photo per item. */
  protected photoStatus: Record<string, string> = {};

  protected itemFilter: ItemFilter = 'ALL';
  protected search = '';
  protected expanded = new Set<string>();
  protected highlighted: string | null = null;
  /** Items with a request running, to show a spinner and avoid double clicks. */
  protected busy = new Set<string>();

  /** Single checks: devices that can be added from the search. */
  protected addableAssets: InventoryItem[] = [];
  protected assetToAdd: string | null = null;

  protected completing = false;
  protected comment = '';
  protected submitting = false;

  private lastCode = '';
  private lastCodeAt = 0;
  /** Text values wait a moment before they are saved; completing sends them first. */
  private readonly pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => Observable<unknown> }>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: InspectionService,
    private readonly permissions: PermissionService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly inventory: InventoryApiService,
    private readonly files: FileApiService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid') ?? '';
    this.load();
  }

  ngOnDestroy(): void {
    this.flushSaves().subscribe();
  }

  // ---- state ----

  protected get open(): boolean {
    return this.detail?.summary.status === 'OPEN';
  }

  /** Single checks (in order / defect) instead of an inventory (present / missing). */
  protected get isCheck(): boolean {
    return this.detail?.summary.mode === 'CHECK';
  }

  protected get goodStatus(): InspectionItemStatus {
    return this.isCheck ? 'PASSED' : 'PRESENT';
  }

  protected get badStatus(): InspectionItemStatus {
    return this.isCheck ? 'FAILED' : 'MISSING';
  }

  protected get goodLabel(): string {
    return this.isCheck ? 'In Ordnung' : 'Da';
  }

  protected get badLabel(): string {
    return this.isCheck ? 'Mangel' : 'Fehlt';
  }

  protected get expectedItems(): InspectionItem[] {
    return this.detail?.items.filter((item) => item.expected) ?? [];
  }

  protected get unexpectedItems(): InspectionItem[] {
    return this.detail?.items.filter((item) => !item.expected) ?? [];
  }

  protected count(status: ItemFilter): number {
    return this.expectedItems.filter((item) => this.matches(item, status)).length;
  }

  private matches(item: InspectionItem, filter: ItemFilter): boolean {
    return filter === 'ALL' || (filter === 'DEFECT' ? item.condition === 'DEFECT' : item.status === filter);
  }

  /** Inventory that also checks whether present assets work. */
  protected get checkFunction(): boolean {
    return !this.isCheck && !!this.detail?.summary.checkFunction;
  }

  /** Present, but the function was not checked yet. */
  protected get functionOpenCount(): number {
    return this.expectedItems.filter((item) => item.status === 'PRESENT' && !item.condition).length;
  }

  protected get reportDefect(): InspectionItem[] {
    return this.expectedItems.filter((item) => item.condition === 'DEFECT');
  }

  protected conditionLabel(item: InspectionItem): string {
    return item.condition === 'OK' ? 'In Ordnung' : item.condition === 'DEFECT' ? 'Defekt' : 'Nicht geprüft';
  }

  protected get progress(): number {
    const total = this.expectedItems.length;
    return total ? Math.round(((total - this.count('PENDING')) / total) * 100) : 100;
  }

  protected get visibleItems(): InspectionItem[] {
    const term = this.search.trim().toLowerCase();
    return this.expectedItems.filter(
      (item) =>
        this.matches(item, this.itemFilter) &&
        (!term || [item.assetName, item.invId, item.serialNumber, item.assetTypeName, item.locationName].some((value) => value?.toLowerCase().includes(term))),
    );
  }

  protected get canDelete(): boolean {
    return this.open ? this.permissions.can('ASSET', 'inspect') : this.permissions.isAdmin;
  }

  /** Check fields of the type for all assets plus those for the asset's type. */
  protected fieldsFor(item: InspectionItem): InspectionField[] {
    if (!item.assetUuid || !this.detail) {
      return [];
    }
    return this.detail.fields.filter((field) => !field.assetTypeUuid || field.assetTypeUuid === item.assetTypeUuid);
  }

  protected value(item: InspectionItem, field: InspectionField): string {
    return item.values.find((entry) => entry.fieldUuid === field.uuid)?.value ?? '';
  }

  protected filledCount(item: InspectionItem): number {
    return this.fieldsFor(item).filter((field) => this.value(item, field) !== '').length;
  }

  protected missingRequired(item: InspectionItem): number {
    return this.fieldsFor(item).filter((field) => field.required && this.value(item, field) === '').length;
  }

  protected get missingRequiredTotal(): number {
    return (
      this.detail?.items.filter((item) => item.status !== 'PENDING' && item.status !== 'MISSING').reduce((sum, item) => sum + this.missingRequired(item), 0) ?? 0
    );
  }

  // ---- report ----

  /** Missing assets for the protocol: confirmed missing first, then not checked. */
  protected get reportMissing(): InspectionItem[] {
    return [...this.expectedItems.filter((item) => item.status === 'MISSING'), ...this.expectedItems.filter((item) => item.status === 'PENDING')];
  }

  protected reportWith(status: InspectionItemStatus): InspectionItem[] {
    return this.expectedItems.filter((item) => item.status === status);
  }

  protected get assetOptions(): SelectOption[] {
    const inList = new Set(this.detail?.items.map((item) => item.assetUuid));
    return this.addableAssets
      .filter((asset) => !inList.has(asset.uuid) && this.areaService.matchesSelection(asset))
      .map((asset) => ({ value: asset.uuid, label: asset.name, hint: asset.invId ?? undefined }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Single checks: put a device on the list without scanning it. */
  protected addAsset(assetUuid: string | null): void {
    if (!assetUuid) {
      return;
    }
    this.api.addItem(this.uuid, assetUuid).subscribe({
      next: (item) => {
        this.replaceItem(item);
        this.focusItem(item);
        setTimeout(() => (this.assetToAdd = null));
      },
      error: (error) => this.handleError(error, 'Gerät konnte nicht hinzugefügt werden.'),
    });
  }

  protected get reportPresent(): InspectionItem[] {
    return this.expectedItems.filter((item) => item.status === 'PRESENT');
  }

  protected print(): void {
    window.print();
  }

  // ---- scanning ----

  protected submitCode(): void {
    const code = this.code;
    this.code = '';
    this.scan(code, true);
  }

  /** Hardware scanners type like a keyboard; bring the focus back if it was lost. */
  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.open || this.completing || event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
      return;
    }
    event.preventDefault();
    this.code += event.key;
    this.scanInput?.nativeElement.focus();
  }

  protected toggleCamera(): void {
    this.cameraOn = !this.cameraOn;
    this.sheetOpen = false;
    this.photoTarget = null;
  }

  protected onCameraCode(code: string): void {
    if (this.photoTarget) {
      return;
    }
    // the label is still in front of the camera while its result is shown
    if (this.sheetOpen && code.trim() === this.lastCode) {
      return;
    }
    this.scan(code, false);
  }

  /** The scanned item of the popup, as it is in the list now (status may have changed since). */
  protected get sheetItem(): InspectionItem | null {
    const uuid = this.lastScan?.item?.uuid;
    const item = uuid ? this.detail?.items.find((entry) => entry.uuid === uuid) : null;
    return item?.expected ? item : null;
  }

  // ---- photos ----

  protected onCameraPhoto(blob: Blob): void {
    const target = this.photoTarget;
    this.photoTarget = null;
    this.sheetOpen = true;
    const item = target && this.detail?.items.find((entry) => entry.uuid === target.itemUuid);
    if (item) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      this.uploadPhoto(item, new File([blob], `pruefung-${stamp}.jpg`, { type: blob.type || 'image/jpeg' }), target.target);
    }
  }

  /** Uploads the image and puts it into the protocol or into the asset's images. */
  protected uploadPhoto(item: InspectionItem, file: File, target: InspectionPhotoTarget): void {
    this.photoStatus[item.uuid] = 'Foto wird hochgeladen...';
    this.files
      .uploadImage(file)
      .pipe(
        filter((event) => event.type === HttpEventType.Response),
        map((event) => event.body!),
        switchMap((stored) => this.api.addPhoto(this.uuid, item.uuid, stored.uuid, target)),
      )
      .subscribe({
        next: (updated) => {
          this.mergeItem(updated);
          this.showPhotoStatus(item.uuid, target === 'ASSET' ? 'Foto in die Bilder des Assets übernommen.' : 'Foto zur Prüfung gespeichert.');
        },
        error: (error) => {
          if (error?.status === 409) {
            this.handleError(error, '');
            return;
          }
          this.showPhotoStatus(item.uuid, error?.error?.message ?? 'Foto konnte nicht gespeichert werden.');
        },
      });
  }

  protected async removePhoto(item: InspectionItem, photo: InspectionPhoto): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Foto entfernen?',
      message: 'Das Foto wird aus dem Prüfprotokoll entfernt.',
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.removePhoto(this.uuid, item.uuid, photo.uuid).subscribe({
      next: (updated) => this.mergeItem(updated),
      error: (error) => this.handleError(error, 'Foto konnte nicht entfernt werden.'),
    });
  }

  /** Takes the new photos and status, keeps values that are typed but not yet saved. */
  private mergeItem(updated: InspectionItem): void {
    const current = this.detail?.items.find((entry) => entry.uuid === updated.uuid);
    this.replaceItem(current ? { ...updated, values: current.values, note: current.note } : updated);
  }

  private showPhotoStatus(itemUuid: string, message: string): void {
    this.photoStatus[itemUuid] = message;
    setTimeout(() => {
      if (this.photoStatus[itemUuid] === message) {
        delete this.photoStatus[itemUuid];
      }
    }, 5000);
  }

  private scan(raw: string, allowRepeat: boolean): void {
    const code = raw.trim();
    if (!code || !this.open) {
      return;
    }
    const now = Date.now();
    if (!allowRepeat && (this.scanning || (code === this.lastCode && now - this.lastCodeAt < DUPLICATE_WINDOW_MS))) {
      return;
    }
    this.lastCode = code;
    this.lastCodeAt = now;
    this.scanning = true;

    this.api.scan(this.uuid, code).subscribe({
      next: (response) => {
        this.scanning = false;
        this.error = '';
        this.lastScan = response;
        this.sheetOpen = true;
        if (response.item) {
          this.replaceItem(response.item);
        }
        const warning = ['UNEXPECTED', 'UNKNOWN', 'ADDED_OTHER_TYPE'].includes(response.outcome);
        const success = ['CHECKED', 'ADDED', 'OPENED'].includes(response.outcome);
        scanFeedback(success ? 'success' : warning ? 'warning' : 'error');
        if (success) {
          this.camera?.flash();
        }
        if (response.item && response.item.expected) {
          this.focusItem(response.item);
        }
        this.scanInput?.nativeElement.focus();
      },
      error: (error) => this.handleError(error, 'Scan konnte nicht verarbeitet werden.'),
    });
  }

  // ---- checking by hand ----

  /** Clicking the active status again resets the item to "not checked". */
  protected setStatus(item: InspectionItem, status: InspectionItemStatus): void {
    if (!this.open || this.busy.has(item.uuid)) {
      return;
    }
    const next = item.status === status ? 'PENDING' : status;
    this.busy.add(item.uuid);
    this.api.updateItem(this.uuid, item.uuid, { status: next }).subscribe({
      next: (updated) => {
        this.busy.delete(item.uuid);
        this.replaceItem(updated);
        if (next !== 'PENDING' && next !== 'MISSING' && this.fieldsFor(updated).length) {
          this.expanded.add(updated.uuid);
        }
      },
      error: (error) => {
        this.busy.delete(item.uuid);
        this.handleError(error, 'Status konnte nicht gespeichert werden.');
      },
    });
  }

  /** Function check; clicking the active one again clears it. In order / defect also means "present". */
  protected setCondition(item: InspectionItem, condition: InspectionCondition): void {
    if (!this.open || this.busy.has(item.uuid)) {
      return;
    }
    const next = item.condition === condition ? '' : condition;
    this.busy.add(item.uuid);
    this.api.updateItem(this.uuid, item.uuid, { condition: next }).subscribe({
      next: (updated) => {
        this.busy.delete(item.uuid);
        this.mergeItem(updated);
      },
      error: (error) => {
        this.busy.delete(item.uuid);
        this.handleError(error, 'Zustand konnte nicht gespeichert werden.');
      },
    });
  }

  protected toggleExpanded(item: InspectionItem): void {
    this.expanded.has(item.uuid) ? this.expanded.delete(item.uuid) : this.expanded.add(item.uuid);
  }

  /** Text fields save after a short pause, choices right away. */
  protected setValue(item: InspectionItem, field: InspectionField, value: string, debounce = false): void {
    if (!field.uuid) {
      return;
    }
    const fieldUuid = field.uuid;
    // show the value immediately
    const existing = item.values.find((entry) => entry.fieldUuid === fieldUuid);
    if (existing) {
      existing.value = value;
    } else {
      item.values.push({ fieldUuid, fieldName: field.name, fieldType: field.fieldType, value });
    }
    const key = `${item.uuid}:${fieldUuid}`;
    clearTimeout(this.pendingSaves.get(key)?.timer);
    this.pendingSaves.delete(key);
    const run = () =>
      this.api.updateItem(this.uuid, item.uuid, { values: { [fieldUuid]: value } }).pipe(
        catchError((error) => {
          this.handleError(error, `„${field.name}“ konnte nicht gespeichert werden.`);
          return of(null);
        }),
      );
    if (!debounce) {
      run().subscribe();
      return;
    }
    const timer = setTimeout(() => {
      this.pendingSaves.delete(key);
      run().subscribe();
    }, 600);
    this.pendingSaves.set(key, { timer, run });
  }

  protected saveNote(item: InspectionItem, note: string): void {
    if ((item.note ?? '') === note) {
      return;
    }
    item.note = note;
    this.api.updateItem(this.uuid, item.uuid, { note }).subscribe({
      error: (error) => this.handleError(error, 'Notiz konnte nicht gespeichert werden.'),
    });
  }

  protected async removeUnexpected(item: InspectionItem): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Eintrag entfernen?',
      message: this.isCheck
        ? `„${item.assetName}“ wird aus dieser Prüfung entfernt.`
        : `„${item.assetName}“ wird aus dieser Prüfung entfernt (z. B. weil versehentlich gescannt).`,
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.removeItem(this.uuid, item.uuid).subscribe({
      next: () => {
        if (this.detail) {
          this.detail.items = this.detail.items.filter((entry) => entry.uuid !== item.uuid);
        }
      },
      error: (error) => this.handleError(error, 'Eintrag konnte nicht entfernt werden.'),
    });
  }

  // ---- completing ----

  protected startCompleting(): void {
    this.completing = true;
  }

  protected complete(): void {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    // values typed just before must be in the protocol
    this.flushSaves()
      .pipe(switchMap(() => this.api.complete(this.uuid, this.comment)))
      .subscribe({
        next: (detail) => {
          this.submitting = false;
          this.completing = false;
          this.cameraOn = false;
          this.detail = detail;
        },
        error: (error) => {
          this.submitting = false;
          this.handleError(error, 'Prüfung konnte nicht abgeschlossen werden.');
        },
      });
  }

  protected async remove(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Prüfung löschen?',
      message: this.open
        ? 'Die Prüfung und alle bisher erfassten Ergebnisse werden gelöscht.'
        : 'Das abgeschlossene Protokoll wird endgültig gelöscht.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.delete(this.uuid).subscribe({
      next: () => this.router.navigate(['/inspections']),
      error: (error) => this.handleError(error, 'Prüfung konnte nicht gelöscht werden.'),
    });
  }

  // ---- helpers ----

  protected itemMeta(item: InspectionItem): string {
    return [item.invId, item.assetTypeName, item.locationName].filter(Boolean).join(' · ');
  }

  protected statusLabel(item: InspectionItem): string {
    if (item.status === 'PRESENT' && item.condition) {
      return item.condition === 'DEFECT' ? 'Da, defekt' : 'Da, in Ordnung';
    }
    switch (item.status) {
      case 'PRESENT':
        return 'Da';
      case 'MISSING':
        return 'Fehlt';
      case 'PASSED':
        return 'In Ordnung';
      case 'FAILED':
        return 'Mangel';
      default:
        return this.open ? 'Offen' : 'Nicht geprüft';
    }
  }

  private flushSaves(): Observable<unknown> {
    const runs = [...this.pendingSaves.values()].map((pending) => {
      clearTimeout(pending.timer);
      return pending.run();
    });
    this.pendingSaves.clear();
    return runs.length ? forkJoin(runs) : of(null);
  }

  private load(): void {
    this.loading = true;
    this.api.inspection(this.uuid).subscribe({
      next: (detail) => {
        this.detail = detail;
        this.loading = false;
        if (this.isCheck && this.open && !this.addableAssets.length) {
          this.inventory.list<InventoryItem>('assets').subscribe({ next: (assets) => (this.addableAssets = assets) });
        }
        setTimeout(() => this.scanInput?.nativeElement.focus());
      },
      error: () => {
        this.error = 'Prüfung konnte nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  private replaceItem(item: InspectionItem): void {
    if (!this.detail) {
      return;
    }
    const index = this.detail.items.findIndex((entry) => entry.uuid === item.uuid);
    if (index >= 0) {
      this.detail.items[index] = item;
    } else {
      this.detail.items = [...this.detail.items, item];
    }
  }

  /** Show the scanned item in the list, with its fields open. */
  private focusItem(item: InspectionItem): void {
    if (!this.matches(item, this.itemFilter)) {
      this.itemFilter = 'ALL';
    }
    this.search = '';
    if (this.fieldsFor(item).length) {
      this.expanded.add(item.uuid);
    }
    this.highlighted = item.uuid;
    setTimeout(() => {
      document.getElementById(`item-${item.uuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    setTimeout(() => {
      if (this.highlighted === item.uuid) {
        this.highlighted = null;
      }
    }, 2500);
  }

  private handleError(error: { status?: number }, message: string): void {
    this.scanning = false;
    if (error?.status === 409) {
      // completed in the meantime (e.g. by someone else): show the protocol
      this.error = 'Die Prüfung wurde inzwischen abgeschlossen.';
      this.load();
      return;
    }
    this.error = message;
    this.sheetOpen = true;
    scanFeedback('error');
  }
}
