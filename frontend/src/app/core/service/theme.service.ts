import { DOCUMENT } from '@angular/common';
import { DestroyRef, Inject, Injectable, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { AuthStateService } from './auth-state.service';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

/** Without a choice the app is light; "System" has to be chosen on purpose. */
export const DEFAULT_THEME: ThemePreference = 'light';
/** The mode last shown, for the start screen in index.html (before the user is known). */
export const LAST_THEME_KEY = 'inventorycore.theme.last';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  preference: ThemePreference = DEFAULT_THEME;
  readonly effective$ = new BehaviorSubject<ThemeMode>('light');
  private readonly media: MediaQueryList | undefined;
  private storageKey = 'inventorycore.theme.guest';

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    state: AuthStateService,
    zone: NgZone,
    destroyRef: DestroyRef,
  ) {
    const window = this.document.defaultView;
    this.media = window?.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => zone.run(() => this.apply());
    this.media?.addEventListener('change', changed);
    const stored = (event: StorageEvent) => {
      if (event.key === this.storageKey || event.key === null) {
        zone.run(() => this.restore());
      }
    };
    window?.addEventListener('storage', stored);
    destroyRef.onDestroy(() => {
      this.media?.removeEventListener('change', changed);
      window?.removeEventListener('storage', stored);
    });
    state.currentUser$.pipe(takeUntilDestroyed(destroyRef)).subscribe((user) => {
      const identity = user?.uuid || user?.username;
      this.storageKey = identity
        ? `inventorycore.theme.user.${encodeURIComponent(identity)}`
        : 'inventorycore.theme.guest';
      this.restore();
    });
  }

  get effective(): ThemeMode {
    return this.effective$.value;
  }

  select(value: ThemePreference): void {
    this.preference = value;
    try {
      // "system" is stored as well, since no stored value now means light
      this.document.defaultView?.localStorage.setItem(this.storageKey, value);
    } catch {
      // Theme selection still works when browser storage is unavailable.
    }
    this.apply();
  }

  private restore(): void {
    let value: string | null = null;
    try {
      value = this.document.defaultView?.localStorage.getItem(this.storageKey) ?? null;
    } catch {
      // Restricted storage falls back to the default.
    }
    this.preference = value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME;
    this.apply();
  }

  private apply(): void {
    const mode =
      this.preference === 'system' ? (this.media?.matches ? 'dark' : 'light') : this.preference;
    this.document.body.dataset['theme'] = mode;
    this.effective$.next(mode);
    try {
      this.document.defaultView?.localStorage.setItem(LAST_THEME_KEY, mode);
    } catch {
      // the start screen is then light, nothing else depends on it
    }
  }
}
