import { Component, Input, OnChanges } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideHistory } from '@lucide/angular';

import { AuditLog, AuditService } from '../../service/audit.service';
import { InfiniteScroll } from '../infinite-scroll.directive';
import { AuditTimeline } from '../audit-timeline/audit-timeline';

const PAGE_SIZE = 15;

/**
 * "Verlauf" card of an asset or location: edits, scans, inspection results. With {@code limit}
 * only the newest entries and a link to the full history ({@code moreLink}); without it, all
 * entries with "load older".
 */
@Component({
  selector: 'app-audit-history',
  imports: [AuditTimeline, InfiniteScroll, RouterLink, LucideChevronRight, LucideHistory],
  template: `
    <section class="card">
      <div class="card-title">
        <h2><svg lucideHistory size="16"></svg> Verlauf</h2>
        @if (total) {
          <span class="hint">{{ total }}</span>
        }
      </div>
      @if (error) {
        <p class="hint">{{ error }}</p>
      } @else if (loading && !entries.length) {
        <p class="hint">Lade Verlauf...</p>
      } @else if (!entries.length) {
        <p class="hint">Noch keine Einträge. Änderungen, Scans und Prüfergebnisse erscheinen hier.</p>
      } @else {
        <app-audit-timeline [entries]="entries" />
        @if (limit && moreLink && total > entries.length) {
          <a class="secondary-action compact more" [routerLink]="moreLink">
            <span>Gesamten Verlauf anzeigen ({{ total }})</span>
            <svg lucideChevronRight size="15"></svg>
          </a>
        } @else if (!limit) {
          <!-- full history: older entries load while scrolling -->
          <div class="list-end" (appInfiniteScroll)="loadMore()" [scrollDisabled]="loading || entries.length >= total">
            @if (loading) {
              <span>Lade ältere Einträge...</span>
            }
          </div>
        }
      }
    </section>
  `,
  styles: `
    h2 {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
    }
    .more {
      width: 100%;
      justify-content: center;
    }
  `,
})
export class AuditHistory implements OnChanges {
  @Input({ required: true }) endpoint!: 'assets' | 'locations';
  @Input({ required: true }) uuid!: string;
  /** Show only this many entries (newest), plus a link to {@link moreLink}. */
  @Input() limit: number | null = null;
  @Input() moreLink: unknown[] | null = null;

  protected entries: AuditLog[] = [];
  protected total = 0;
  protected loading = false;
  protected error = '';
  private page = 0;

  constructor(private readonly audit: AuditService) {}

  ngOnChanges(): void {
    this.entries = [];
    this.total = 0;
    this.page = 0;
    this.load();
  }

  protected loadMore(): void {
    if (this.loading || this.error || this.entries.length >= this.total) {
      return;
    }
    this.page++;
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.error = '';
    this.audit.ofObject(this.endpoint, this.uuid, this.page, this.limit ?? PAGE_SIZE).subscribe({
      next: (result) => {
        this.entries = [...this.entries, ...result.items];
        this.total = result.total;
        this.loading = false;
      },
      error: () => {
        this.error = 'Verlauf konnte nicht geladen werden.';
        this.loading = false;
      },
    });
  }
}
