import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export function needsPdfPrint(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone ||
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches;
  return !!(ios && standalone);
}

export interface PreparedPdf {
  file: File;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class PdfPrintService {
  readonly state = new BehaviorSubject<PreparedPdf | null>(null);

  async generate(
    pages: HTMLElement[],
    width: number,
    height: number,
    title: string,
    signal: AbortSignal,
    copies = 1,
  ): Promise<File> {
    const { jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    signal.throwIfAborted();
    if (!pages.length) {
      throw new Error('No print pages');
    }
    const pdf = new jsPDF({
      unit: 'mm',
      format: [width, height],
      orientation: width > height ? 'landscape' : 'portrait',
      compress: true,
    });
    const paper = getComputedStyle(document.body).getPropertyValue('--print-paper-color').trim();
    let count = 0;
    for (const page of pages) {
      signal.throwIfAborted();
      await Promise.all(Array.from(page.querySelectorAll('img')).map((image) => image.decode()));
      const bounds = page.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        throw new Error('Print page has no dimensions');
      }
      // Bound canvas memory on iOS; release each raster before preparing the next page.
      const scale = Math.min(
        width < 100 && height < 100 ? 3 : 2,
        Math.sqrt(4_000_000 / (bounds.width * bounds.height)),
      );
      const canvas = await html2canvas(page, {
        scale,
        backgroundColor: paper,
        useCORS: true,
        logging: false,
        windowWidth: Math.max(1024, Math.ceil(bounds.width)),
        windowHeight: Math.max(768, Math.ceil(bounds.height)),
      });
      let image: string;
      try {
        signal.throwIfAborted();
        image = canvas.toDataURL('image/png');
      } finally {
        canvas.width = canvas.height = 0;
      }
      for (let copy = 0; copy < copies; copy++) {
        if (count++) {
          pdf.addPage([width, height], width > height ? 'landscape' : 'portrait');
        }
        pdf.addImage(image, 'PNG', 0, 0, width, height, undefined, 'FAST');
      }
    }
    signal.throwIfAborted();
    const name =
      title
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .trim()
        .slice(0, 120) || 'InventoryCore';
    return new File([pdf.output('blob')], `${name}.pdf`, { type: 'application/pdf' });
  }

  open(file: File): void {
    this.close();
    this.state.next({ file, url: URL.createObjectURL(file) });
  }

  close(): void {
    const current = this.state.value;
    if (current) {
      URL.revokeObjectURL(current.url);
      this.state.next(null);
    }
  }
}
