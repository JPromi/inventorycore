import { currentLanguage, t } from '../../core/i18n/i18n';
import { InventoryItem } from '../inventory/data-access/inventory-api.service';
import { locationPath } from '../../shared/util/location-utils';

export type LabelElementType = 'text' | 'barcode' | 'box' | 'logo';

/** One element on a label. Positions and sizes are in millimeters from the top left corner. */
export interface LabelElement {
  id: string;
  type: LabelElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text with placeholders like `{name}`; for barcodes the encoded value. */
  content?: string;
  // text
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  // barcode
  symbology?: string;
  /** Human readable text below linear barcodes. */
  showText?: boolean;
  // box
  borderWidth?: number;
  useBrandColor?: boolean;
}

export interface LabelTemplate {
  uuid: string;
  name: string;
  description?: string | null;
  areaUuid: string;
  defaultForArea: boolean;
  widthMm: number;
  heightMm: number;
  /** Margin along every edge that no element may reach into. */
  safeAreaMm: number;
  elementsJson: string;
}

export interface LabelTemplateRequest {
  name: string;
  description: string | null;
  areaUuid: string | null;
  defaultForArea: boolean;
  widthMm: number;
  heightMm: number;
  safeAreaMm: number;
  elementsJson: string;
}

export interface LabelSizePreset {
  name: string;
  widthMm: number;
  heightMm: number;
  /** Safe area for this size; null = the general default. */
  safeAreaMm: number | null;
}

/** Editor defaults maintained by admins. */
export interface LabelSettings {
  /** Safe area new templates and sizes without their own value start with. */
  safeAreaMm: number;
  sizePresets: LabelSizePreset[];
}

/** Values the placeholders are replaced with, e.g. `{ name: 'Atemschutzgerät PA 1' }`. */
export type LabelContext = Record<string, string>;

export interface Symbology {
  id: string;
  label: string;
  /** 2D codes keep their aspect ratio, linear codes are stretched to the element size. */
  twoDimensional: boolean;
  hint?: string;
}

export const SYMBOLOGIES: Symbology[] = [
  { id: 'qrcode', label: t('labels.symbologies.qrcode'), twoDimensional: true },
  { id: 'datamatrix', label: t('labels.symbologies.datamatrix'), twoDimensional: true },
  { id: 'azteccode', label: t('labels.symbologies.azteccode'), twoDimensional: true },
  { id: 'pdf417', label: t('labels.symbologies.pdf417'), twoDimensional: false },
  { id: 'code128', label: t('labels.symbologies.code128'), twoDimensional: false },
  {
    id: 'code39',
    label: t('labels.symbologies.code39'),
    twoDimensional: false,
    hint: t('labels.symbologyHints.code39'),
  },
  {
    id: 'ean13',
    label: t('labels.symbologies.ean13'),
    twoDimensional: false,
    hint: t('labels.symbologyHints.ean13'),
  },
  {
    id: 'ean8',
    label: t('labels.symbologies.ean8'),
    twoDimensional: false,
    hint: t('labels.symbologyHints.ean8'),
  },
  {
    id: 'upca',
    label: t('labels.symbologies.upca'),
    twoDimensional: false,
    hint: t('labels.symbologyHints.upca'),
  },
  {
    id: 'interleaved2of5',
    label: t('labels.symbologies.interleaved2of5'),
    twoDimensional: false,
    hint: t('labels.symbologyHints.interleaved2of5'),
  },
];

export interface Placeholder {
  key: string;
  label: string;
}

/** `key` is the placeholder token (`{key}`) and is never translated, only its display name. */
export const PLACEHOLDERS: Placeholder[] = [
  { key: 'brandName', label: t('labels.placeholders.brandName') },
  { key: 'brandColor', label: t('labels.placeholders.brandColor') },
  { key: 'website', label: t('labels.placeholders.website') },
  { key: 'imprint', label: t('labels.placeholders.imprint') },
  { key: 'privacy', label: t('labels.placeholders.privacy') },
  { key: 'support', label: t('labels.placeholders.support') },
  { key: 'loginTitle', label: t('labels.placeholders.loginTitle') },
  { key: 'loginMessage', label: t('labels.placeholders.loginMessage') },
  { key: 'name', label: t('common.name') },
  { key: 'invId', label: t('terms.invId') },
  { key: 'serialNumber', label: t('terms.serialNumber') },
  { key: 'inventoryNumber', label: t('terms.inventoryNumber') },
  { key: 'type', label: t('terms.assetType') },
  { key: 'location', label: t('terms.location') },
  { key: 'locationPath', label: t('labels.placeholders.locationPath') },
  { key: 'areas', label: t('terms.areas') },
  { key: 'description', label: t('common.description') },
  { key: 'url', label: t('labels.placeholders.url') },
  { key: 'uuid', label: t('labels.placeholders.uuid') },
  { key: 'date', label: t('labels.placeholders.date') },
];

/** Largest safe area that still leaves 1 mm for elements. */
export function maxSafeAreaMm(widthMm: number, heightMm: number): number {
  return Math.max(0, Math.floor(((Math.min(widthMm, heightMm) - 1) / 2) * 10) / 10);
}

/** Shrinks and moves the element so it lies completely inside the safe area. */
export function keepInSafeArea(
  element: LabelElement,
  widthMm: number,
  heightMm: number,
  safeAreaMm: number,
): void {
  const innerWidth = Math.max(1, widthMm - 2 * safeAreaMm);
  const innerHeight = Math.max(1, heightMm - 2 * safeAreaMm);
  element.width = Math.min(Math.max(1, Number(element.width) || 1), innerWidth);
  element.height = Math.min(Math.max(1, Number(element.height) || 1), innerHeight);
  element.x = Math.min(
    Math.max(Number(element.x) || 0, safeAreaMm),
    safeAreaMm + innerWidth - element.width,
  );
  element.y = Math.min(
    Math.max(Number(element.y) || 0, safeAreaMm),
    safeAreaMm + innerHeight - element.height,
  );
}

/** Preview data for label designs; the keys are placeholder tokens, only the values are texts. */
export const SAMPLE_CONTEXT: LabelContext = {
  name: t('labels.sample.name'),
  invId: 'FW-2026-0042',
  serialNumber: 'SN-7HX92K3',
  inventoryNumber: '100245',
  type: t('labels.sample.type'),
  location: t('labels.sample.location'),
  locationPath: t('labels.sample.locationPath'),
  areas: t('labels.sample.areas'),
  description: t('labels.sample.description'),
  url: `${globalThis.location?.origin ?? ''}/assets/00000000-0000-0000-0000-000000000000`,
  uuid: '00000000-0000-0000-0000-000000000000',
  date: new Date().toLocaleDateString(currentLanguage()),
};

export function parseElements(json: string | null | undefined): LabelElement[] {
  try {
    const value = JSON.parse(json || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function newElementId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Replaces `{key}` and `{field:key}` placeholders; unknown placeholders become empty. */
export function resolveContent(content: string | undefined, context: LabelContext): string {
  return (content ?? '').replace(
    /\{([a-zA-Z]+(?::[^}]+)?)\}/g,
    (_, key: string) => context[key] ?? '',
  );
}

/** Builds the placeholder values for one asset. */
export function assetLabelContext(
  asset: InventoryItem,
  data: {
    locations?: InventoryItem[];
    assetTypes?: InventoryItem[];
    areaName?: (uuid: string) => string;
  },
): LabelContext {
  const locations = data.locations ?? [];
  const location = locations.find((entry) => entry.uuid === asset.locationUuid);
  const context: LabelContext = {
    name: asset.name ?? '',
    invId: asset.invId ?? '',
    serialNumber: asset.serialNumber ?? '',
    inventoryNumber: asset.inventoryNumber ?? '',
    description: asset.description ?? '',
    type: data.assetTypes?.find((type) => type.uuid === asset.assetTypeUuid)?.name ?? '',
    location: location?.name ?? '',
    locationPath: location ? locationPath(locations, location) : '',
    areas: (asset.areaUuids ?? [])
      .map((uuid) => data.areaName?.(uuid) ?? '')
      .filter(Boolean)
      .join(', '),
    url: `${globalThis.location?.origin ?? ''}/assets/${asset.uuid}`,
    uuid: asset.uuid,
    date: new Date().toLocaleDateString(currentLanguage()),
  };
  for (const field of asset.fieldValues ?? []) {
    context[`field:${field.fieldKey ?? field.name}`] = field.value ?? '';
  }
  return context;
}

/**
 * Picks the template to preselect for an asset: the default of one of its own areas,
 * then the default of the default area, then any template.
 */
export function defaultTemplateFor(
  templates: LabelTemplate[],
  areaUuids: string[],
  defaultAreaUuid?: string,
): LabelTemplate | undefined {
  return (
    templates.find(
      (template) =>
        template.defaultForArea &&
        areaUuids.includes(template.areaUuid) &&
        template.areaUuid !== defaultAreaUuid,
    ) ??
    templates.find(
      (template) => template.defaultForArea && template.areaUuid === defaultAreaUuid,
    ) ??
    templates.find((template) => areaUuids.includes(template.areaUuid)) ??
    templates[0]
  );
}
