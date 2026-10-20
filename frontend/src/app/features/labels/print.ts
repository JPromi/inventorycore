import { currentLanguage, t } from '../../core/i18n/i18n';

/**
 * Prints rendered labels (each `copies` times) through a hidden iframe whose page size equals the label size,
 * so label printers (Brother, Dymo, Zebra, ...) get exactly one label per page.
 */
export async function printLabels(
  labels: HTMLElement[],
  widthMm: number,
  heightMm: number,
  copies = 1,
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
  const pages = labels
    .map((label) =>
      `<div class="page">${label.outerHTML.replace(/box-shadow:[^;"]*;?/g, '')}</div>`.repeat(
        Math.max(1, copies),
      ),
    )
    .join('');
  doc.open();
  doc.write(`<!doctype html>
<html lang="${currentLanguage()}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t('terms.label'))}</title>
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .page { width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; page-break-after: always; break-after: page; }
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
