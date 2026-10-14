import { Component, Input, OnChanges } from '@angular/core';
import { LucideHistory } from '@lucide/angular';

import { AuditLog, AuditService } from '../../service/audit.service';
import { AuditTimeline } from '../audit-timeline/audit-timeline';

const PAGE_SIZE = 15;

/** "Verlauf" card of an asset or location: edits, scans, inspection results; loads more on demand. */
@Component({
  selector: 'app-audit-history',
  imports: [AuditTimeline, LucideHistory],
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
        @if (entries.length < total) {
          <button type="button" class="secondary-action compact more" [disabled]="loading" (click)="loadMore()">
            {{ loading ? 'Lädt...' : 'Ältere anzeigen' }}
          </button>
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
    }
  `,
})
export class AuditHistory implements OnChanges {
  @Input({ required: true }) endpoint!: 'assets' | 'locations';
  @Input({ required: true }) uuid!: string;

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
    this.page++;
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.error = '';
    this.audit.ofObject(this.endpoint, this.uuid, this.page, PAGE_SIZE).subscribe({
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
