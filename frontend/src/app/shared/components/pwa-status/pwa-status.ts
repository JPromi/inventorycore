import { Component } from '@angular/core';
import { LucideRefreshCw, LucideTriangleAlert, LucideWifiOff, LucideX } from '@lucide/angular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PwaService } from '../../../core/service/pwa.service';

/** Notices at the bottom of the screen: offline, new version available, broken cache. */
@Component({
  selector: 'app-pwa-status',
  imports: [TranslatePipe, LucideRefreshCw, LucideTriangleAlert, LucideWifiOff, LucideX],
  templateUrl: './pwa-status.html',
  styleUrl: './pwa-status.scss',
})
export class PwaStatus {
  constructor(protected readonly pwa: PwaService) {}
}
