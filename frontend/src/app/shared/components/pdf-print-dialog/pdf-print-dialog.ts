import { Component, DestroyRef, ElementRef, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { LucideDownload, LucideShare2, LucideX } from '@lucide/angular';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PdfPrintService, PreparedPdf } from './pdf-print.service';

@Component({
  selector: 'app-pdf-print-dialog',
  imports: [TranslatePipe, LucideDownload, LucideShare2, LucideX],
  templateUrl: './pdf-print-dialog.html',
  styleUrl: './pdf-print-dialog.scss',
})
export class PdfPrintDialog implements OnInit {
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;
  protected state: PreparedPdf | null = null;
  protected canShare = false;
  protected sharing = false;
  protected failed = false;

  constructor(
    protected readonly pdf: PdfPrintService,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef,
  ) {}

  ngOnInit(): void {
    this.pdf.state.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((state) => {
      this.state = state;
      this.failed = false;
      this.sharing = false;
      this.canShare = !!(
        state &&
        typeof navigator.share === 'function' &&
        navigator.canShare?.({ files: [state.file] })
      );
      if (state && !this.dialog.nativeElement.open) {
        this.dialog.nativeElement.showModal();
      } else if (!state && this.dialog.nativeElement.open) {
        this.dialog.nativeElement.close();
      }
    });
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.pdf.close();
      }
    });
    this.destroyRef.onDestroy(() => this.pdf.close());
  }

  protected async share(): Promise<void> {
    if (!this.state || this.sharing) {
      return;
    }
    this.sharing = true;
    this.failed = false;
    try {
      // Must run directly in this button's gesture, never after PDF generation.
      await navigator.share({ files: [this.state.file], title: this.state.file.name });
    } catch (error) {
      this.failed = !(error instanceof DOMException && error.name === 'AbortError');
    } finally {
      this.sharing = false;
    }
  }
}
