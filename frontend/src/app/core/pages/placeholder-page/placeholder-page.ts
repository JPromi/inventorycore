import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { t } from '../../i18n/i18n';

@Component({
  selector: 'app-placeholder-page',
  templateUrl: './placeholder-page.html',
  styleUrl: './placeholder-page.scss',
})
export class PlaceholderPage {
  protected readonly title: string;

  constructor(private readonly route: ActivatedRoute) {
    this.title = this.route.snapshot.data['title'] ?? t('placeholder.title');
  }
}
