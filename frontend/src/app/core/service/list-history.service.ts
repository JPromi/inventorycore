import { DestroyRef, Injectable } from '@angular/core';
import { NavigationSkipped, NavigationSkippedCode, NavigationStart, Router } from '@angular/router';

interface Snapshot {
  key: string;
  state: unknown;
}

interface ActiveList {
  capture: () => Snapshot;
  reset: () => void;
}

/** List filters belong to one browser history entry, not to the next visit of that route. */
@Injectable({ providedIn: 'root' })
export class ListHistoryService {
  private readonly snapshots = new Map<number, Snapshot>();
  private active: ActiveList | null = null;
  private restoredId: number | null = null;

  constructor(private readonly router: Router) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        const outgoing = this.router.lastSuccessfulNavigation()?.id;
        if (outgoing !== undefined && this.active) {
          this.snapshots.set(outgoing, this.active.capture());
        }
        this.restoredId = event.navigationTrigger === 'popstate'
          ? event.restoredState?.navigationId ?? null : null;
        if (event.url.split('?')[0] === '/login') {
          this.snapshots.clear();
        }
      } else if (event instanceof NavigationSkipped &&
        event.code === NavigationSkippedCode.IgnoredSameUrlNavigation &&
        this.router.currentNavigation()?.trigger === 'imperative') {
        // Clicking the navigation link of the current list is also an intentional fresh visit.
        this.active?.reset();
      }
    });
  }

  /** Restore before the first API request. Returns whether this entry had saved filters. */
  bind<T>(
    key: string,
    read: () => T,
    restore: (state: T) => void,
    destroyRef: DestroyRef,
    refresh: () => void,
  ): boolean {
    const defaults = structuredClone(read());
    const saved = this.restoredId === null ? undefined : this.snapshots.get(this.restoredId);
    const restored = saved?.key === key;
    if (restored) {
      restore(structuredClone(saved.state) as T);
    }
    const active: ActiveList = {
      capture: () => ({ key, state: structuredClone(read()) }),
      reset: () => {
        restore(structuredClone(defaults));
        refresh();
      },
    };
    this.active = active;
    destroyRef.onDestroy(() => {
      if (this.active === active) {
        this.active = null;
      }
    });
    return restored;
  }
}
