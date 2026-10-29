import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LucideGrid2X2, LucideList, LucideListTree } from '@lucide/angular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ListView, storeListView } from '../../util/list-view';

/**
 * List / grid (/ tree) buttons of a list page. Remembers the choice per `page` in this browser;
 * read the initial value with `storedListView(page, views)`.
 *
 * <app-view-switch page="inspections" [(view)]="view" />
 */
@Component({
  selector: 'app-view-switch',
  imports: [TranslatePipe, LucideGrid2X2, LucideList, LucideListTree],
  templateUrl: './view-switch.html',
  styleUrl: './view-switch.scss',
})
export class ViewSwitch {
  /** storage key of the page */
  @Input({ required: true }) page = '';
  @Input() views: ListView[] = ['list', 'grid'];
  @Input() view: ListView = 'list';
  @Output() readonly viewChange = new EventEmitter<ListView>();

  protected select(view: ListView): void {
    this.view = view;
    storeListView(this.page, view);
    this.viewChange.emit(view);
  }
}
