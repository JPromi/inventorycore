import { ApplicationRef, Injectable, NgZone, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter, first } from 'rxjs';

/** Chrome/Edge event that lets the app show its own "install" button. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Look for a new app version this often while the app is open. */
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;

/**
 * Everything PWA: new versions from the service worker, the install prompt and the online state.
 * The service worker only runs in production builds, so in `ng serve` updates never show up.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  /** A new version is downloaded and waits for a reload. */
  readonly updateReady = signal(false);
  /** The cached app is broken (e.g. files deleted on the server); only a reload helps. */
  readonly broken = signal(false);
  readonly canInstall = signal(false);
  readonly online = signal(navigator.onLine);
  /** Runs as installed app (own window, no browser UI). */
  readonly standalone = signal(false);

  private installPrompt: BeforeInstallPromptEvent | null = null;

  constructor(
    private readonly swUpdate: SwUpdate,
    private readonly appRef: ApplicationRef,
    private readonly zone: NgZone,
  ) {
    this.watchConnection();
    this.watchInstall();
    this.watchUpdates();
  }

  /** Installs the app via the browser dialog; false if the user cancelled or it is not possible. */
  async install(): Promise<boolean> {
    const prompt = this.installPrompt;
    if (!prompt) {
      return false;
    }
    this.installPrompt = null;
    this.canInstall.set(false);
    await prompt.prompt();
    return (await prompt.userChoice).outcome === 'accepted';
  }

  /** Switches to the downloaded version (reloads the page). */
  async applyUpdate(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      document.location.reload();
    }
  }

  reload(): void {
    document.location.reload();
  }

  dismissUpdate(): void {
    this.updateReady.set(false);
  }

  private watchConnection(): void {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }

  private watchInstall(): void {
    const standalone = window.matchMedia('(display-mode: standalone)');
    this.standalone.set(
      standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    standalone.addEventListener('change', (event) => this.standalone.set(event.matches));

    window.addEventListener('beforeinstallprompt', (event) => {
      // keep the browser from showing its own mini bar; the navigation offers the button instead
      event.preventDefault();
      this.installPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.canInstall.set(false);
    });
  }

  private watchUpdates(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));
    this.swUpdate.unrecoverable.subscribe(() => this.broken.set(true));

    // check right after start-up and then regularly; also when the app comes back to the foreground
    const check = () => this.swUpdate.checkForUpdate().catch(() => undefined);
    this.appRef.isStable.pipe(first((stable) => stable)).subscribe(() => {
      check();
      // outside Angular: a running interval would otherwise keep the app from ever being stable
      this.zone.runOutsideAngular(() => setInterval(check, UPDATE_CHECK_INTERVAL));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        check();
      }
    });
  }
}
