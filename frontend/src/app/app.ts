import { Component, OnInit } from '@angular/core';
import { PdfPrintDialog } from './shared/components/pdf-print-dialog/pdf-print-dialog';
import { RouterOutlet } from '@angular/router';

import { PwaStatus } from './shared/components/pwa-status/pwa-status';
import { ImageViewer } from './shared/components/image-viewer/image-viewer';
import { AuthService } from './core/service/auth.service';
import { CustomizationService } from './core/service/customization.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaStatus, ImageViewer, PdfPrintDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = 'inventorycore';

  constructor(
    private readonly authService: AuthService,
    private readonly customization: CustomizationService,
  ) {}

  ngOnInit(): void {
    this.authService.initializeSession().subscribe();
    this.customization.load().subscribe();
  }
}
