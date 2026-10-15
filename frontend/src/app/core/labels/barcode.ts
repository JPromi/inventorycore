import { t } from '../i18n/i18n';
import { SYMBOLOGIES } from './label.model';

type BwipModule = typeof import('bwip-js/browser');

let bwipPromise: Promise<BwipModule> | null = null;
const cache = new Map<string, string>();

/** bwip-js is large, so it is only loaded when a label is shown for the first time. */
function loadBwip(): Promise<BwipModule> {
  bwipPromise ??= import('bwip-js/browser');
  return bwipPromise;
}

export interface BarcodeResult {
  svg: string | null;
  error: string | null;
}

/**
 * Renders a barcode as SVG markup that scales to its container.
 * Invalid content (e.g. letters in an EAN) results in an error message instead of an exception.
 */
export async function renderBarcode(symbology: string, text: string, showText: boolean): Promise<BarcodeResult> {
  if (!text) {
    return { svg: null, error: t('labels.barcode.noContent') };
  }
  const key = `${symbology}|${showText}|${text}`;
  const cached = cache.get(key);
  if (cached) {
    return { svg: cached, error: null };
  }

  const twoDimensional = SYMBOLOGIES.find((entry) => entry.id === symbology)?.twoDimensional ?? false;
  try {
    const bwip = await loadBwip();
    const raw = bwip.toSVG({
      bcid: symbology,
      text,
      scale: 3,
      includetext: !twoDimensional && showText,
      textxalign: 'center',
    });
    // let the SVG fill the element: 2D codes keep their proportions, linear codes stretch
    const svg = raw.replace(
      '<svg ',
      `<svg preserveAspectRatio="${twoDimensional ? 'xMidYMid meet' : 'none'}" style="width:100%;height:100%;display:block" `,
    );
    cache.set(key, svg);
    return { svg, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { svg: null, error: message.replace(/^bwipp\.\w+#?\d*:\s*/, '') || t('labels.barcode.invalid') };
  }
}
