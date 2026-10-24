import { currentLanguage, t } from '../../core/i18n/i18n';
import { LabelSheet, sheetSlot } from './label.model';
import {
  needsPdfPrint,
  PdfPrintService,
} from '../../shared/components/pdf-print-dialog/pdf-print.service';

/** Labels side by side on sheets of paper; the first `skip` positions are already used. */
export interface SheetPrint {
  sheet: LabelSheet;
  skip: number;
}

/**
 * Prints rendered labels (each `copies` times) through a hidden iframe. Without a sheet the page size
 * equals the label size, so label printers (Brother, Dymo, Zebra, ...) get exactly one label per page;
 * with a sheet every page is a sheet of paper with the labels in its grid.
 */
export async function printLabels(
  labels: HTMLElement[],
  widthMm: number,
  heightMm: number,
  copies = 1,
  pdf?: PdfPrintService,
  signal?: AbortSignal,
  sheetPrint?: SheetPrint,
): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  // the label carries only inline styles; drop the editor shadow for print
  const html = labels.map((label) => label.outerHTML.replace(/box-shadow:[^;"]*;?/g, ''));
  const sheet = sheetPrint?.sheet;
  const pages = sheet
    ? sheetPages(html, widthMm, heightMm, Math.max(1, copies), sheet, sheetPrint.skip)
    : html.map((label) => `<div class="page">${label}</div>`.repeat(Math.max(1, copies))).join('');
  const pageWidth = sheet?.paperWidthMm ?? widthMm;
  const pageHeight = sheet?.paperHeightMm ?? heightMm;
  doc.open();
  doc.write(`<!doctype html>
<html lang="${currentLanguage()}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t('terms.label'))}</title>
<style>
  @page { size: ${pageWidth}mm ${pageHeight}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .page { position: relative; width: ${pageWidth}mm; height: ${pageHeight}mm; overflow: hidden; page-break-after: always; break-after: page; }
  .slot { position: absolute; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .label { box-shadow: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${pages}</body>
</html>`);
  doc.close();

  // Wait for the branding logo to load in the print document, not just in the preview.
  try {
    await Promise.all(Array.from(doc.images).map((image) => image.decode()));
  } catch {
    iframe.remove();
    throw new Error(t('labels.print.logoFailed'));
  }

  if (pdf && signal && needsPdfPrint()) {
    try {
      // single labels repeat the same page per copy; on sheets the copies are already laid out
      const count = sheet ? 1 : Math.max(1, copies);
      const pages = Array.from(doc.querySelectorAll<HTMLElement>('.page')).filter(
        (_, index) => index % count === 0,
      );
      const file = await pdf.generate(
        pages,
        pageWidth,
        pageHeight,
        t('terms.label'),
        signal,
        count,
      );
      signal.throwIfAborted();
      pdf.open(file);
    } finally {
      iframe.remove();
    }
    return;
  }

  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  // give the browser a moment to lay out the SVGs
  setTimeout(() => {
    win.focus();
    win.print();
    // some browsers do not fire afterprint for iframes
    setTimeout(cleanup, 60_000);
  }, 150);
}

/** Fills the sheet grid row by row, leaving the first `skip` positions of the first sheet empty. */
function sheetPages(
  labels: string[],
  widthMm: number,
  heightMm: number,
  copies: number,
  sheet: LabelSheet,
  skip: number,
): string {
  const perSheet = Math.max(1, sheet.columns * sheet.rows);
  const slots: (string | null)[] = [
    ...Array<null>(Math.min(Math.max(0, skip), perSheet - 1)).fill(null),
    ...labels.flatMap((label) => Array<string>(copies).fill(label)),
  ];
  let pages = '';
  for (let start = 0; start < slots.length; start += perSheet) {
    const content = slots
      .slice(start, start + perSheet)
      .map((label, index) => {
        if (label === null) {
          return '';
        }
        const { x, y } = sheetSlot(sheet, widthMm, heightMm, index);
        return `<div class="slot" style="left: ${x}mm; top: ${y}mm">${label}</div>`;
      })
      .join('');
    pages += `<div class="page">${content}</div>`;
  }
  return pages;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
