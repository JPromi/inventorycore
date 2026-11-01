import { HttpErrorResponse } from '@angular/common/http';
import { t } from '../i18n/i18n';

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'image/heic', 'image/heif',
];

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  heic: 'image/heic', heif: 'image/heif',
};

function imageType(file: File): string {
  const type = file.type.toLowerCase();
  return !type || type === 'application/octet-stream'
    ? EXTENSION_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
    : type;
}

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(imageType(file));
}

/** Safari can decode iPhone HEIC photos; the server and other browsers receive JPEG. */
export async function prepareImage(file: File): Promise<File> {
  const type = imageType(file);
  const heic = type === 'image/heic' || type === 'image/heif';
  const source = file.type === type ? file : new File([file], file.name, { type });
  if (!heic && type !== 'image/jpeg') {
    return source;
  }

  const url = URL.createObjectURL(source);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Image decoding failed'));
      image.src = url;
    });
    // Same maximum edge as the server default. Avoid unnecessary reencoding of small JPEGs.
    const factor = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    if (!heic && factor === 1 && file.size < 1024 * 1024) {
      return source;
    }
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Encoding failed')), 'image/jpeg', 0.85);
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg', lastModified: file.lastModified,
    });
  } catch {
    // A JPEG still has a server decoder fallback; HEIC must never reach that decoder.
    if (!heic) return source;
    throw new HttpErrorResponse({ status: 415, error: {
      message: t('components.imageUpload.errors.heicConversion'),
    } });
  } finally {
    URL.revokeObjectURL(url);
    image.src = '';
    canvas.width = canvas.height = 0;
  }
}
