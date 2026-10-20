import { Component, Input } from '@angular/core';

import { AssetStatus, isRetired, statusName } from '../data-access/asset-status.service';

/** Status of an asset as a small pill: colored dot and name; retired assets look grey. */
@Component({
  selector: 'app-asset-status-badge',
  template: `
    @if (status) {
      <span
        class="status-badge"
        [class.retired]="retired"
        [class.large]="large"
        [style.--status-color]="status.color || null"
      >
        <span class="dot"></span>{{ name }}
      </span>
    }
  `,
  styleUrl: './asset-status-badge.scss',
})
export class AssetStatusBadge {
  @Input() status: AssetStatus | null | undefined = null;
  @Input() large = false;

  protected get name(): string {
    return statusName(this.status);
  }

  protected get retired(): boolean {
    return isRetired(this.status);
  }
}
