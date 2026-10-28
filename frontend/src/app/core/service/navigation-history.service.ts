import { Location } from '@angular/common';
import { Injectable } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

interface Entry {
  id: number;
  url: string;
}

/**
 * Mirrors the browser history of this app (pushes, replaced URLs, back/forward), so a page can go
 * back to where the user came from instead of a fixed list, e.g. to the scanner after a scan.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private entries: Entry[] = [];
  /** Position of the current page in `entries`; later entries can be reached with "forward". */
  private current = -1;
  /** navigationId of the history entry a back/forward navigation restores. */
  private restoredId: number | null = null;

  constructor(
    private readonly router: Router,
    private readonly location: Location,
  ) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.restoredId =
          event.navigationTrigger === 'popstate'
            ? (event.restoredState?.navigationId ?? null)
            : null;
      } else if (event instanceof NavigationEnd) {
        this.record(event);
      }
    });
  }

  /**
   * The last page before the current one whose URL does not belong to the current object
   * (`skip` returns true for e.g. its edit or history pages); null when there is none.
   */
  previous(skip: (url: string) => boolean): string | null {
    return this.find(skip)?.entry.url ?? null;
  }

  /** Goes back in the browser history to `previous(skip)`, otherwise opens `fallback`. */
  back(skip: (url: string) => boolean, fallback: string): void {
    const found = this.find(skip);
    if (found) {
      this.location.historyGo(-found.distance);
    } else {
      this.router.navigateByUrl(fallback);
    }
  }

  private find(skip: (url: string) => boolean): { entry: Entry; distance: number } | null {
    for (let index = this.current - 1; index >= 0; index--) {
      if (!skip(this.entries[index].url)) {
        return { entry: this.entries[index], distance: this.current - index };
      }
    }
    return null;
  }

  private record(event: NavigationEnd): void {
    const entry = { id: event.id, url: event.urlAfterRedirects };
    if (this.restoredId !== null) {
      // back/forward: move to the restored entry (it keeps the id the browser history refers to)
      const index = this.entries.findIndex((existing) => existing.id === this.restoredId);
      this.restoredId = null;
      if (index >= 0) {
        this.current = index;
        this.entries[index] = { ...entry, id: this.entries[index].id };
      } else {
        // an entry from before this page load: the history before it is unknown
        this.entries = [entry];
        this.current = 0;
      }
      return;
    }
    if (this.router.lastSuccessfulNavigation()?.extras.replaceUrl && this.current >= 0) {
      this.entries[this.current] = entry;
      return;
    }
    this.entries = [...this.entries.slice(0, this.current + 1), entry];
    this.current = this.entries.length - 1;
  }
}
