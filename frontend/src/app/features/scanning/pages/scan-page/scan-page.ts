import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LucideBoxes,
  LucideCamera,
  LucideCameraOff,
  LucideChevronRight,
  LucideCircleAlert,
  LucideCornerDownLeft,
  LucideExternalLink,
  LucideHistory,
  LucideKeyboard,
  LucideMapPin,
  LucideScanBarcode,
  LucideTrash2,
  LucideVolume2,
  LucideVolumeX,
} from '@lucide/angular';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { CameraView } from '../../../../shared/components/camera-view/camera-view';
import { t } from '../../../../core/i18n/i18n';
import { TranslateCountPipe, TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { CameraScanner } from '../../camera-scanner';
import { scanFeedback } from '../../scan-feedback';
import {
  InventoryApiService,
  InventoryItem,
} from '../../../inventory/data-access/inventory-api.service';
import { ScanResult, ScanService } from '../../data-access/scan.service';
import { locationPath } from '../../../../shared/util/location-utils';

type InputMode = 'camera' | 'scanner';

interface HistoryEntry {
  code: string;
  time: Date;
  /** Name of what was found, null if nothing. */
  label: string | null;
  route: string[] | null;
}

/** The same code is ignored for this long (the camera sees it many times per second). */
const DUPLICATE_WINDOW_MS = 2500;
const HISTORY_SIZE = 15;
const STORAGE_KEY = 'inventorycore.scan';

type MatchContext = 'found' | 'asset' | 'location';
type MatchKind = 'link' | 'uuid' | 'invId' | 'inventoryNumber' | 'serialNumber' | 'any';

/** Whole texts per context, so no sentence is put together from fragments. Locations only match by link, ID or code. */
const MATCH_TEXTS: Record<MatchContext, Record<MatchKind, string>> = {
  found: {
    link: t('scan.found.link'),
    uuid: t('scan.found.uuid'),
    invId: t('scan.found.invId'),
    inventoryNumber: t('scan.found.inventoryNumber'),
    serialNumber: t('scan.found.serialNumber'),
    any: t('scan.found.any'),
  },
  asset: {
    link: t('scan.assetFound.link'),
    uuid: t('scan.assetFound.uuid'),
    invId: t('scan.assetFound.invId'),
    inventoryNumber: t('scan.assetFound.inventoryNumber'),
    serialNumber: t('scan.assetFound.serialNumber'),
    any: t('scan.assetFound.any'),
  },
  location: {
    link: t('scan.locationFound.link'),
    uuid: t('scan.locationFound.uuid'),
    invId: t('scan.locationFound.any'),
    inventoryNumber: t('scan.locationFound.any'),
    serialNumber: t('scan.locationFound.any'),
    any: t('scan.locationFound.any'),
  },
};

/**
 * Scanning with the camera or with a hardware scanner that types the code and presses Enter
 * (keyboard wedge). The found asset or location is shown right on the page.
 */
@Component({
  selector: 'app-scan-page',
  imports: [
    CameraView,
    FormsModule,
    RouterLink,
    LucideBoxes,
    LucideCamera,
    LucideCameraOff,
    LucideChevronRight,
    LucideCircleAlert,
    LucideCornerDownLeft,
    LucideExternalLink,
    LucideHistory,
    LucideKeyboard,
    LucideMapPin,
    LucideScanBarcode,
    LucideTrash2,
    LucideVolume2,
    LucideVolumeX,
    TranslatePipe,
    TranslateCountPipe,
  ],
  templateUrl: './scan-page.html',
  styleUrl: './scan-page.scss',
})
export class ScanPage implements OnInit {
  @ViewChild(CameraView) private camera?: CameraView;
  @ViewChild('scanInput') private scanInputRef?: ElementRef<HTMLInputElement>;

  protected mode: InputMode = 'scanner';
  protected autoOpen = false;
  protected sound = true;

  protected manualCode = '';
  protected result: ScanResult | null = null;
  protected lookingUp = false;
  protected error = '';
  protected history: HistoryEntry[] = [];

  /** Camera mode: the camera is running (full screen on phones and tablets). */
  protected cameraOpen = false;
  /** Result popup over the full-screen camera. */
  protected sheetOpen = false;

  protected readonly cameraAvailable = CameraScanner.available;

  private lastCode = '';
  private lastCodeAt = 0;
  private locations: InventoryItem[] = [];
  private types: InventoryItem[] = [];

  constructor(
    private readonly scanService: ScanService,
    private readonly api: InventoryApiService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.restoreSettings();
    // names for the result card; the scan also works without them
    forkJoin({
      locations: this.api.list<InventoryItem>('locations').pipe(catchError(() => of([]))),
      types: this.api.list<InventoryItem>('asset-types').pipe(catchError(() => of([]))),
    }).subscribe(({ locations, types }) => {
      this.locations = locations;
      this.types = types;
    });
    // wait for the view, the video element is created by the template
    this.cameraOpen = this.mode === 'camera';
    setTimeout(() => this.focusInput());
  }

  // ---- mode & settings ----

  protected setMode(mode: InputMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.saveSettings();
    this.cameraOpen = mode === 'camera';
    this.sheetOpen = false;
    if (mode === 'scanner') {
      setTimeout(() => this.focusInput());
    }
  }

  protected toggleAutoOpen(): void {
    this.autoOpen = !this.autoOpen;
    this.saveSettings();
  }

  protected toggleSound(): void {
    this.sound = !this.sound;
    this.saveSettings();
  }

  // ---- scanner / keyboard input ----

  protected submitManual(): void {
    const code = this.manualCode;
    this.manualCode = '';
    // a hardware scanner should be able to scan the same label again right away
    this.handleCode(code, true);
  }

  /**
   * Hardware scanners type like a keyboard. If the focus left the input (e.g. after clicking
   * somewhere), the next typed character brings it back, so no scan gets lost.
   */
  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (
      this.mode !== 'scanner' ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.key.length !== 1
    ) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
    ) {
      return;
    }
    event.preventDefault();
    this.manualCode += event.key;
    this.focusInput();
  }

  // ---- camera ----

  protected openCamera(): void {
    this.sheetOpen = false;
    this.cameraOpen = true;
  }

  protected onCameraCode(code: string): void {
    // the label is still in front of the camera while its result is shown
    if (this.sheetOpen && code.trim() === this.lastCode) {
      return;
    }
    this.handleCode(code, false);
  }

  // ---- result ----

  protected get assetCount(): number {
    return this.result?.assets.length ?? 0;
  }

  protected get matchCount(): number {
    return (this.result?.assets.length ?? 0) + (this.result?.locations.length ?? 0);
  }

  protected thumbnail(item: InventoryItem): string | null {
    const images = item.images ?? [];
    const cover = images.find((image) => image.kind === 'THUMBNAIL') ?? images[0];
    return cover?.thumbnailUrl || cover?.url || null;
  }

  protected typeName(item: InventoryItem): string | null {
    return this.types.find((type) => type.uuid === item.assetTypeUuid)?.name ?? null;
  }

  /** Inventory id, type and location for the result popup; with several hits also the field that matched. */
  protected assetLines(asset: InventoryItem): string[] {
    const matched = this.result && this.matchCount > 1 ? this.matchText(this.result, asset) : null;
    return [
      matched,
      asset.invId,
      this.typeName(asset),
      this.locationName(asset.locationUuid),
    ].filter((line): line is string => !!line);
  }

  protected locationName(uuid: string | null | undefined): string | null {
    const location = this.locations.find((entry) => entry.uuid === uuid);
    return location ? locationPath(this.locations, location) : null;
  }

  /**
   * How the code was understood; with an asset, the field that matched (several assets can share a serial number).
   * `found`: "Gefunden über …", `asset` / `location`: the eyebrow of the result card.
   */
  protected matchText(
    result: ScanResult,
    asset?: InventoryItem,
    context: MatchContext = 'found',
  ): string {
    switch (result.matchedBy) {
      case 'LINK':
        return MATCH_TEXTS[context].link;
      case 'UUID':
        return MATCH_TEXTS[context].uuid;
    }
    const code = result.code.toLowerCase();
    if (asset?.invId?.toLowerCase() === code) {
      return MATCH_TEXTS[context].invId;
    }
    if (asset?.inventoryNumber?.toLowerCase() === code) {
      return MATCH_TEXTS[context].inventoryNumber;
    }
    if (asset?.serialNumber?.toLowerCase() === code) {
      return MATCH_TEXTS[context].serialNumber;
    }
    return MATCH_TEXTS[context].any;
  }

  protected clearHistory(): void {
    this.history = [];
  }

  private handleCode(raw: string, allowRepeat: boolean): void {
    const code = raw.trim();
    if (!code) {
      return;
    }
    const now = Date.now();
    if (
      !allowRepeat &&
      (this.lookingUp || (code === this.lastCode && now - this.lastCodeAt < DUPLICATE_WINDOW_MS))
    ) {
      return;
    }
    this.lastCode = code;
    this.lastCodeAt = now;
    this.lookingUp = true;
    this.error = '';

    this.scanService.lookup(code).subscribe({
      next: (result) => {
        this.lookingUp = false;
        this.result = result;
        const found = this.matchCount > 0;
        this.feedback(found);
        this.addHistory(result);
        this.sheetOpen = true;
        if (found && this.autoOpen && this.matchCount === 1) {
          const route = this.routeOf(result);
          if (route) {
            this.router.navigate(route);
            return;
          }
        }
        this.focusInput();
      },
      error: () => {
        this.lookingUp = false;
        this.error = t('scan.lookupFailed');
        this.sheetOpen = true;
        this.feedback(false);
        this.focusInput();
      },
    });
  }

  private routeOf(result: ScanResult): string[] | null {
    if (result.assets.length === 1 && !result.locations.length) {
      return ['/assets', result.assets[0].uuid];
    }
    if (result.locations.length === 1 && !result.assets.length) {
      return ['/locations', result.locations[0].uuid];
    }
    return null;
  }

  private addHistory(result: ScanResult): void {
    const first = result.assets[0] ?? result.locations[0];
    const label = !first
      ? null
      : this.matchCount > 1
        ? t('scan.hitCount', { count: this.matchCount })
        : first.name;
    this.history = [
      { code: result.code, time: new Date(), label, route: this.routeOf(result) },
      ...this.history,
    ].slice(0, HISTORY_SIZE);
  }

  private feedback(success: boolean): void {
    if (success) {
      this.camera?.flash();
    }
    scanFeedback(success ? 'success' : 'error', this.sound);
  }

  private focusInput(): void {
    if (this.mode === 'scanner') {
      this.scanInputRef?.nativeElement.focus();
    }
  }

  private restoreSettings(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      this.mode = saved.mode === 'camera' && this.cameraAvailable ? 'camera' : 'scanner';
      this.autoOpen = saved.autoOpen === true;
      this.sound = saved.sound !== false;
    } catch {
      // defaults
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode: this.mode, autoOpen: this.autoOpen, sound: this.sound }),
      );
    } catch {
      // not important enough to show an error
    }
  }
}
