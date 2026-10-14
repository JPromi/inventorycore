/** Hue 0-360, saturation and value 0-1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalizes "abc", "#ABC" or "#aabbcc" to "#aabbcc"; null if it is no valid hex color. */
export function normalizeHex(value: string | null | undefined): string | null {
  const match = value?.trim().match(HEX_PATTERN);
  if (!match) {
    return null;
  }
  let hex = match[1].toLowerCase();
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  return `#${hex}`;
}

export function hexToHsv(hex: string): Hsv {
  const value = normalizeHex(hex) ?? '#000000';
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);

  let h = 0;
  if (delta) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

/** Black or white, whichever is easier to read on the given background. */
export function readableTextColor(hex: string | null | undefined): string {
  const value = normalizeHex(hex);
  if (!value) {
    return 'inherit';
  }
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  // perceived brightness (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1f2937' : '#ffffff';
}
