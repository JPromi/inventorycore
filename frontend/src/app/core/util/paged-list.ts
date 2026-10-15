import { HttpParams } from '@angular/common/http';
import { Observable, Subject, Subscription } from 'rxjs';

/** One page of a server list (backend `PageResponse`). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}

/** Entries loaded per request; the next page follows when the user scrolls to the end. */
export const PAGE_SIZE = 50;

/** Delay after typing before the server is searched. */
export const SEARCH_DELAY_MS = 300;

/** Query parameters for a page request; empty values are left out, arrays are repeated. */
export function pageParams(filter: Record<string, string | string[] | null | undefined>, page: number, size: number): HttpParams {
  let params = new HttpParams().set('page', page).set('size', size);
  for (const [key, value] of Object.entries(filter)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => (params = params.append(key, entry)));
    } else if (value && value.trim()) {
      params = params.set(key, value.trim());
    }
  }
  return params;
}

/**
 * Items of a searched list, loaded page by page from the server. `reload()` starts over
 * (new search or filter), `loadMore()` appends the next page; answers of outdated requests are dropped.
 */
export class PagedList<T, P extends Page<T> = Page<T>> {
  items: T[] = [];
  total = 0;
  loading = false;
  /** at least one page arrived since the last reload */
  loaded = false;
  error = false;
  hasMore = false;
  /** the last page answer, for extra data some endpoints send along (e.g. tab counts) */
  last: P | null = null;
  /** every page answer as it arrives */
  readonly loadedPages = new Subject<P>();

  private nextPage = 0;
  private request?: Subscription;

  constructor(private readonly fetch: (page: number, size: number) => Observable<P>, private readonly size = PAGE_SIZE) {}

  reload(): void {
    this.request?.unsubscribe();
    this.items = [];
    this.total = 0;
    this.nextPage = 0;
    this.hasMore = false;
    this.loaded = false;
    this.load();
  }

  loadMore(): void {
    if (!this.loading && this.hasMore && !this.error) {
      this.load();
    }
  }

  /** Removes entries locally after they were deleted (the total follows). */
  remove(predicate: (item: T) => boolean): void {
    const before = this.items.length;
    this.items = this.items.filter((item) => !predicate(item));
    this.total = Math.max(0, this.total - (before - this.items.length));
  }

  destroy(): void {
    this.request?.unsubscribe();
    this.loadedPages.complete();
  }

  private load(): void {
    this.loading = true;
    this.error = false;
    this.request = this.fetch(this.nextPage, this.size).subscribe({
      next: (page) => {
        this.items = [...this.items, ...page.items];
        this.total = page.total;
        this.hasMore = page.hasMore;
        this.last = page;
        this.nextPage = page.page + 1;
        this.loading = false;
        this.loaded = true;
        this.loadedPages.next(page);
      },
      error: () => {
        this.error = true;
        this.loading = false;
      },
    });
  }
}
