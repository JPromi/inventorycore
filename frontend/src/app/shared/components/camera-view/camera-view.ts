import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import {
  LucideCamera,
  LucideCircleAlert,
  LucideSwitchCamera,
  LucideX,
  LucideZap,
  LucideZapOff,
} from '@lucide/angular';

import { t } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { CameraDevice, CameraScanner } from '../../../features/scanning/camera-scanner';

type CameraState = 'starting' | 'running' | 'error';

const STORAGE_KEY = 'inventorycore.camera';
/** Phones and tablets (also big ones in landscape): the camera takes the whole screen. */
const IMMERSIVE_QUERY = '(max-width: 900px), (hover: none) and (pointer: coarse)';

/**
 * Live camera that reads barcodes. Starts when it is created and stops when it is removed.
 * On phones and tablets it covers the whole screen and shows the projected content as a sheet
 * at the bottom (`sheetOpen`); on desktops it is a card in the page and the sheet stays hidden,
 * because the page shows the result next to it.
 */
@Component({
  selector: 'app-camera-view',
  imports: [
    TranslatePipe,
    LucideCamera,
    LucideCircleAlert,
    LucideSwitchCamera,
    LucideX,
    LucideZap,
    LucideZapOff,
  ],
  templateUrl: './camera-view.html',
  styleUrl: './camera-view.scss',
})
export class CameraView implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('video', { static: true }) private videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('sheet') private sheetRef?: ElementRef<HTMLElement>;

  @Input() title = t('components.cameraView.title');
  @Input() hint = t('components.cameraView.hint');
  /** Shows the projected content as sheet over the camera (only in full screen). */
  @Input() sheetOpen = false;
  /** Take a photo instead of scanning: shows a shutter button, codes are ignored. */
  @Input() photoMode = false;
  @Input() photoHint = t('components.cameraView.takePhoto');

  @Output() readonly code = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly sheetClose = new EventEmitter<void>();
  @Output() readonly photo = new EventEmitter<Blob>();
  @Output() readonly photoCancel = new EventEmitter<void>();

  @HostBinding('class.immersive') protected immersive = false;

  protected state: CameraState = 'starting';
  protected error = '';
  protected cameras: CameraDevice[] = [];
  protected torchSupported = false;
  protected torchOn = false;
  protected flashing = false;
  protected capturing = false;

  private scanner: CameraScanner | null = null;
  private cameraId: string | null = null;
  private readonly media = window.matchMedia(IMMERSIVE_QUERY);
  private readonly onMediaChange = (event: MediaQueryListEvent) => this.setImmersive(event.matches);

  constructor(private readonly zone: NgZone) {}

  ngOnInit(): void {
    // before the first check, it is a host binding
    this.setImmersive(this.media.matches);
    this.media.addEventListener('change', this.onMediaChange);
  }

  ngAfterViewInit(): void {
    try {
      this.cameraId = localStorage.getItem(STORAGE_KEY);
    } catch {
      // default camera
    }
    // after the first check: the state is shown in the template
    setTimeout(() => this.start());
  }

  ngOnDestroy(): void {
    this.scanner?.stop();
    this.media.removeEventListener('change', this.onMediaChange);
    document.body.classList.remove('camera-open');
  }

  /** Short green flash after a good read. */
  flash(): void {
    this.flashing = true;
    setTimeout(() => (this.flashing = false), 400);
  }

  protected async start(deviceId: string | null = this.cameraId): Promise<void> {
    this.scanner?.stop();
    this.state = 'starting';
    this.error = '';
    this.torchOn = false;
    this.scanner = new CameraScanner(this.videoRef.nativeElement, (code) =>
      this.zone.run(() => this.onCode(code)),
    );
    try {
      await this.scanner.start(deviceId);
      this.state = 'running';
      this.cameraId = this.scanner.activeDeviceId ?? deviceId;
      this.torchSupported = this.scanner.torchSupported;
      // labels and ids are only complete after the permission was granted
      this.cameras = await CameraScanner.devices();
    } catch (error) {
      // the remembered camera may be gone (e.g. unplugged): try the default one
      if (deviceId && (error as { name?: string })?.name === 'OverconstrainedError') {
        this.remember(null);
        return this.start(null);
      }
      this.state = 'error';
      this.error = describeCameraError(error);
    }
  }

  protected async shoot(): Promise<void> {
    if (!this.scanner || this.capturing) {
      return;
    }
    this.capturing = true;
    try {
      const blob = await this.scanner.takePhoto();
      this.flash();
      this.photo.emit(blob);
    } catch {
      this.error = t('components.cameraView.errors.photo');
    } finally {
      this.capturing = false;
    }
  }

  /** Next camera (front / back / external). */
  protected switchCamera(): void {
    if (this.cameras.length < 2) {
      return;
    }
    const index = this.cameras.findIndex((camera) => camera.deviceId === this.cameraId);
    const next = this.cameras[(index + 1) % this.cameras.length].deviceId;
    this.remember(next);
    this.start(next);
  }

  protected async toggleTorch(): Promise<void> {
    try {
      await this.scanner?.setTorch(!this.torchOn);
      this.torchOn = !this.torchOn;
    } catch {
      this.torchSupported = false;
    }
  }

  protected close(): void {
    if (this.photoMode) {
      this.photoCancel.emit();
      return;
    }
    this.scanner?.stop();
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.sheetOpen && this.immersive && !this.photoMode) {
      this.sheetClose.emit();
    } else {
      this.close();
    }
  }

  /** Free the camera while the app is in the background. */
  @HostListener('document:visibilitychange')
  protected onVisibilityChange(): void {
    if (document.hidden) {
      this.scanner?.stop();
      this.state = 'starting';
    } else {
      this.start();
    }
  }

  /** No codes while taking a photo or while typing into the sheet (another label may be in view). */
  private onCode(code: string): void {
    const typing =
      this.sheetOpen && !!this.sheetRef?.nativeElement.contains(document.activeElement);
    if (!this.photoMode && !typing) {
      this.code.emit(code);
    }
  }

  private setImmersive(immersive: boolean): void {
    this.immersive = immersive;
    // the page behind must not scroll while the camera covers it
    document.body.classList.toggle('camera-open', immersive);
  }

  private remember(deviceId: string | null): void {
    this.cameraId = deviceId;
    try {
      deviceId ? localStorage.setItem(STORAGE_KEY, deviceId) : localStorage.removeItem(STORAGE_KEY);
    } catch {
      // not important
    }
  }
}

function describeCameraError(error: unknown): string {
  switch ((error as { name?: string })?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return t('components.cameraView.errors.notAllowed');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t('components.cameraView.errors.notFound');
    case 'NotReadableError':
      return t('components.cameraView.errors.notReadable');
    default:
      return t('components.cameraView.errors.start');
  }
}
