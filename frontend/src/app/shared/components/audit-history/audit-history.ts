import { NgTemplateOutlet } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronDown, LucideChevronRight, LucideHistory } from '@lucide/angular';

import { t } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AuditLog, AuditService } from '../../../features/audit/data-access/audit.service';
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
  imports: [
    AuditTimeline,
    NgTemplateOutlet,
    InfiniteScroll,
    RouterLink,
    TranslatePipe,
    LucideChevronRight,
    LucideHistory,
    LucideChevronDown,
  ],
  template: `
    @if (limit) {
      <details class="history-preview">
        <summary>
          <svg lucideHistory size="15" aria-hidden="true"></svg>
          <span>{{ 'common.history' | t }}</span>
          @if (total) {
            <span class="count">{{ total }}</span>
          }
          <svg class="chevron" lucideChevronDown size="15" aria-hidden="true"></svg>
        </summary>
        <div class="history-content">
          <ng-container *ngTemplateOutlet="content" />
        </div>
      </details>
    } @else {
      <section class="card">
        <div class="card-title">
          <h2><svg lucideHistory size="16"></svg> {{ 'common.history' | t }}</h2>
          @if (total) {
            <span class="hint">{{ total }}</span>
          }
        </div>
        <ng-container *ngTemplateOutlet="content" />
      </section>
    }
    <ng-template #content>
      @if (error) {
        <p class="hint">{{ error }}</p>
      } @else if (loading && !entries.length) {
        <p class="hint">{{ 'components.auditHistory.loading' | t }}</p>
      } @else if (!entries.length) {
        <p class="hint">{{ 'components.auditHistory.empty' | t }}</p>
      } @else {
        <app-audit-timeline [entries]="entries" />
        @if (limit && moreLink && total > entries.length) {
          <a class="secondary-action compact more" [routerLink]="moreLink">
            <span>{{ 'components.auditHistory.showAll' | t: { count: total } }}</span>
            <svg lucideChevronRight size="15"></svg>
          </a>
        } @else if (!limit) {
          <!-- full history: older entries load while scrolling -->
          <div
            class="list-end"
            (appInfiniteScroll)="loadMore()"
            [scrollDisabled]="loading || entries.length >= total"
          >
            @if (loading) {
              <span>{{ 'components.auditHistory.loadingOlder' | t }}</span>
            }
          </div>
        }
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;

      h2 {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }

      .history-preview {
        color: var(--text-muted);
        font-size: 0.85rem;

        summary {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-height: 2.75rem;
          padding-inline: 0.25rem;
          list-style: none;
          cursor: pointer;

          &::-webkit-details-marker {
            display: none;
          }

          &:hover {
            color: var(--text);
          }

          &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
            border-radius: var(--radius-xs);
          }
        }

        .count {
          font-size: 0.75rem;
        }

        .chevron {
          margin-left: auto;
        }

        &[open] .chevron {
          transform: rotate(180deg);
        }
      }

      .history-content {
        padding: 0.5rem 0.25rem;
        color: var(--text);
      }

      .more {
        margin-top: 0.5rem;
      }
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
        this.error = t('components.auditHistory.loadError');
        this.loading = false;
      },
    });
  }
}
