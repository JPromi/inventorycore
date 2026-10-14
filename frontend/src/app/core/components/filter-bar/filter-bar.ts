import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { LucideChevronDown, LucideSlidersHorizontal, LucideX } from '@lucide/angular';

/**
 * Toolbar for overview pages: search plus filters. On desktops everything is in one row; on
 * phones only the search stays visible and the filters fold away behind a "Filter" button that
 * shows how many are active.
 *
 * Usage: `<app-filter-bar class="toolbar" [activeCount]="n" [canReset]="..." (reset)="...">`
 * with the search box marked `filterSearch` and the filter fields as other content.
 */
@Component({
  selector: 'app-filter-bar',
  imports: [LucideChevronDown, LucideSlidersHorizontal, LucideX],
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.scss',
})
export class FilterBar {
  /** Number of set filters (without the search), shown on the folded button. */
  @Input() activeCount = 0;
  /** Shows "Zurücksetzen" (usually also when only a search is entered). */
  @Input() canReset = false;
  /** False when the page has only the search: no "Filter" button then. */
  @Input() hasFilters = true;
  @Output() readonly reset = new EventEmitter<void>();

  @HostBinding('class.no-filters') protected get noFilters(): boolean {
    return !this.hasFilters;
  }

  protected open = false;
}
