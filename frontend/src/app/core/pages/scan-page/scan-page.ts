import { Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LucideBoxes,
  LucideCamera,
  LucideCameraOff,
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
  LucideZap,
  LucideZapOff,
} from '@lucide/angular';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { CameraDevice, CameraScanner } from '../../scan/camera-scanner';
import { scanFeedback } from '../../scan/scan-feedback';
import { InventoryApiService, InventoryItem } from '../../service/inventory-api.service';
import { ScanResult, ScanService } from '../../service/scan.service';
import { locationPath } from '../../util/location-utils';

type InputMode = 'camera' | 'scanner';
type CameraState = 'idle' | 'starting' | 'running' | 'error';

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

/**
 * Scanning with the camera or with a hardware scanner that types the code and presses Enter
 * (keyboard wedge). The found asset or location is shown right on the page.
 */
@Component({
  selector: 'app-scan-page',
  imports: [
    FormsModule,
    RouterLink,
    LucideBoxes,
    LucideCamera,
    LucideCameraOff,
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
    LucideZap,
    LucideZapOff,
  ],
  templateUrl: './scan-page.html',
  styleUrl: './scan-page.scss',
})
export class ScanPage implements OnInit, OnDestroy {
  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('scanInput') private scanInputRef?: ElementRef<HTMLInputElement>;

  protected mode: InputMode = 'scanner';
  protected autoOpen = false;
  protected sound = true;

  protected manualCode = '';
  protected result: ScanResult | null = null;
  protected lookingUp = false;
  protected error = '';
  protected history: HistoryEntry[] = [];

  protected cameraState: CameraState = 'idle';
  protected cameraError = '';
  protected cameras: CameraDevice[] = [];
  protected cameraId: string | null = null;
  protected torchSupported = false;
  protected torchOn = false;
  /** Short highlight of the camera frame after a successful read. */
  protected flash = false;

  protected readonly cameraAvailable = CameraScanner.available;

  private scanner: CameraScanner | null = null;
  private lastCode = '';
  private lastCodeAt = 0;
  private locations: InventoryItem[] = [];
  private types: InventoryItem[] = [];

  constructor(
    private readonly scanService: ScanService,
    private readonly api: InventoryApiService,
    private readonly router: Router,
    private readonly zone: NgZone,
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
    setTimeout(() => (this.mode === 'camera' ? this.startCamera() : this.focusInput()));
  }

  ngOnDestroy(): void {
    this.scanner?.stop();
  }

  // ---- mode & settings ----

  protected setMode(mode: InputMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.saveSettings();
    if (mode === 'camera') {
      setTimeout(() => this.startCamera());
    } else {
      this.stopCamera();
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
    if (this.mode !== 'scanner' || event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
      return;
    }
    event.preventDefault();
    this.manualCode += event.key;
    this.focusInput();
  }

  // ---- camera ----

  protected async startCamera(deviceId: string | null = this.cameraId): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!video || !this.cameraAvailable) {
      return;
    }
    this.scanner?.stop();
    this.cameraState = 'starting';
    this.cameraError = '';
    this.torchOn = false;
    this.scanner = new CameraScanner(video, (code) => this.zone.run(() => this.handleCode(code, false)));
    try {
      await this.scanner.start(deviceId);
      this.cameraState = 'running';
      this.cameraId = this.scanner.activeDeviceId ?? deviceId;
      this.torchSupported = this.scanner.torchSupported;
      // labels of the cameras are only known after the permission was granted
      this.cameras = await CameraScanner.devices();
    } catch (error) {
      // the remembered camera may be gone (e.g. unplugged): try the default one
      if (deviceId && (error as { name?: string })?.name === 'OverconstrainedError') {
        this.cameraId = null;
        this.saveSettings();
        return this.startCamera(null);
      }
      this.cameraState = 'error';
      this.cameraError = this.describeCameraError(error);
    }
  }

  protected stopCamera(): void {
    this.scanner?.stop();
    this.scanner = null;
    this.cameraState = 'idle';
    this.torchOn = false;
  }

  protected switchCamera(deviceId: string): void {
    this.cameraId = deviceId;
    this.saveSettings();
    this.startCamera(deviceId);
  }

  protected async toggleTorch(): Promise<void> {
    try {
      await this.scanner?.setTorch(!this.torchOn);
      this.torchOn = !this.torchOn;
    } catch {
      this.torchSupported = false;
    }
  }

  /** Free the camera while the tab is in the background. */
  @HostListener('document:visibilitychange')
  protected onVisibilityChange(): void {
    if (this.mode !== 'camera') {
      return;
    }
    if (document.hidden) {
      this.stopCamera();
    } else if (this.cameraState === 'idle') {
      this.startCamera();
    }
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

  protected locationName(uuid: string | null | undefined): string | null {
    const location = this.locations.find((entry) => entry.uuid === uuid);
    return location ? locationPath(this.locations, location) : null;
  }

  protected matchText(result: ScanResult): string {
    switch (result.matchedBy) {
      case 'LINK':
        return 'über den Link im Code';
      case 'UUID':
        return 'über die ID';
      default:
        return 'über Inventar-ID, Inventarnummer oder Seriennummer';
    }
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
    if (!allowRepeat && (this.lookingUp || (code === this.lastCode && now - this.lastCodeAt < DUPLICATE_WINDOW_MS))) {
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
        this.error = 'Abfrage fehlgeschlagen. Ist die Verbindung zum Server da?';
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
    const label = !first ? null : this.matchCount > 1 ? `${this.matchCount} Treffer` : first.name;
    this.history = [{ code: result.code, time: new Date(), label, route: this.routeOf(result) }, ...this.history].slice(0, HISTORY_SIZE);
  }

  private feedback(success: boolean): void {
    if (success) {
      this.flash = true;
      setTimeout(() => (this.flash = false), 400);
    }
    scanFeedback(success ? 'success' : 'error', this.sound);
  }

  private focusInput(): void {
    if (this.mode === 'scanner') {
      this.scanInputRef?.nativeElement.focus();
    }
  }

  private describeCameraError(error: unknown): string {
    const name = (error as { name?: string })?.name;
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Kein Zugriff auf die Kamera. Bitte den Zugriff im Browser erlauben (Schloss-Symbol neben der Adresse).';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'Keine passende Kamera gefunden.';
      case 'NotReadableError':
        return 'Die Kamera wird gerade von einem anderen Programm verwendet.';
      default:
        return 'Die Kamera konnte nicht gestartet werden.';
    }
  }

  private restoreSettings(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      this.mode = saved.mode === 'camera' && this.cameraAvailable ? 'camera' : 'scanner';
      this.autoOpen = saved.autoOpen === true;
      this.sound = saved.sound !== false;
      this.cameraId = typeof saved.cameraId === 'string' ? saved.cameraId : null;
    } catch {
      // defaults
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode: this.mode, autoOpen: this.autoOpen, sound: this.sound, cameraId: this.cameraId }),
      );
    } catch {
      // not important enough to show an error
    }
  }
}
