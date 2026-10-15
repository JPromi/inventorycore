import { InventoryItem } from '../service/inventory-api.service';
import { locationPath } from '../util/location-utils';

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
  elementsJson: string;
}

export interface LabelTemplateRequest {
  name: string;
  description: string | null;
  areaUuid: string | null;
  defaultForArea: boolean;
  widthMm: number;
  heightMm: number;
  elementsJson: string;
}

/** Values the placeholders are replaced with, e.g. `{ name: 'Laptop' }`. */
export type LabelContext = Record<string, string>;

export interface Symbology {
  id: string;
  label: string;
  /** 2D codes keep their aspect ratio, linear codes are stretched to the element size. */
  twoDimensional: boolean;
  hint?: string;
}

export const SYMBOLOGIES: Symbology[] = [
  { id: 'qrcode', label: 'QR-Code', twoDimensional: true },
  { id: 'datamatrix', label: 'Data Matrix', twoDimensional: true },
  { id: 'azteccode', label: 'Aztec', twoDimensional: true },
  { id: 'pdf417', label: 'PDF417', twoDimensional: false },
  { id: 'code128', label: 'Code 128', twoDimensional: false },
  { id: 'code39', label: 'Code 39', twoDimensional: false, hint: 'Nur A–Z, 0–9 und - . $ / + % Leerzeichen' },
  { id: 'ean13', label: 'EAN-13', twoDimensional: false, hint: '12 oder 13 Ziffern' },
  { id: 'ean8', label: 'EAN-8', twoDimensional: false, hint: '7 oder 8 Ziffern' },
  { id: 'upca', label: 'UPC-A', twoDimensional: false, hint: '11 oder 12 Ziffern' },
  { id: 'interleaved2of5', label: 'Interleaved 2 of 5', twoDimensional: false, hint: 'Gerade Anzahl Ziffern' },
];

export interface Placeholder {
  key: string;
  label: string;
}

export const PLACEHOLDERS: Placeholder[] = [
  { key: 'brandName', label: 'Markenname' },
  { key: 'brandColor', label: 'Markenfarbe' },
  { key: 'website', label: 'Website' },
  { key: 'imprint', label: 'Impressum' },
  { key: 'privacy', label: 'Datenschutz' },
  { key: 'support', label: 'Support' },
  { key: 'loginTitle', label: 'Login-Titel' },
  { key: 'loginMessage', label: 'Login-Text' },
  { key: 'name', label: 'Name' },
  { key: 'invId', label: 'Inventar-ID' },
  { key: 'serialNumber', label: 'Seriennummer' },
  { key: 'inventoryNumber', label: 'Inventarnummer' },
  { key: 'type', label: 'Typ' },
  { key: 'location', label: 'Standort' },
  { key: 'locationPath', label: 'Standort-Pfad' },
  { key: 'areas', label: 'Bereiche' },
  { key: 'description', label: 'Beschreibung' },
  { key: 'url', label: 'Link zum Asset' },
  { key: 'uuid', label: 'UUID' },
  { key: 'date', label: 'Druckdatum' },
];

export const LABEL_SIZE_PRESETS: { label: string; width: number; height: number }[] = [
  { label: '62 × 29 mm (Brother DK-11209)', width: 62, height: 29 },
  { label: '62 × 100 mm (Brother DK-11202)', width: 62, height: 100 },
  { label: '29 × 90 mm (Brother DK-11201)', width: 90, height: 29 },
  { label: '50 × 25 mm', width: 50, height: 25 },
  { label: '57 × 32 mm (Dymo 11354)', width: 57, height: 32 },
  { label: '89 × 36 mm (Dymo 99012)', width: 89, height: 36 },
  { label: '100 × 50 mm', width: 100, height: 50 },
  { label: '24 mm Band, 60 mm lang', width: 60, height: 24 },
];

export const SAMPLE_CONTEXT: LabelContext = {
  name: 'Laptop Dell Latitude 5440',
  invId: 'INV-2026-1A2B3C4D',
  serialNumber: 'SN-7HX92K3',
  inventoryNumber: '100245',
  type: 'Notebook',
  location: 'Büro 2.14',
  locationPath: 'Hauptgebäude / 2. OG / Büro 2.14',
  areas: 'EDV',
  description: 'Arbeitsplatzrechner Buchhaltung',
  url: `${globalThis.location?.origin ?? ''}/assets/00000000-0000-0000-0000-000000000000`,
  uuid: '00000000-0000-0000-0000-000000000000',
  date: new Date().toLocaleDateString('de-DE'),
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
  return (content ?? '').replace(/\{([a-zA-Z]+(?::[^}]+)?)\}/g, (_, key: string) => context[key] ?? '');
}

/** Builds the placeholder values for one asset. */
export function assetLabelContext(
  asset: InventoryItem,
  data: { locations?: InventoryItem[]; assetTypes?: InventoryItem[]; areaName?: (uuid: string) => string },
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
    areas: (asset.areaUuids ?? []).map((uuid) => data.areaName?.(uuid) ?? '').filter(Boolean).join(', '),
    url: `${globalThis.location?.origin ?? ''}/assets/${asset.uuid}`,
    uuid: asset.uuid,
    date: new Date().toLocaleDateString('de-DE'),
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
export function defaultTemplateFor(templates: LabelTemplate[], areaUuids: string[], defaultAreaUuid?: string): LabelTemplate | undefined {
  return (
    templates.find((template) => template.defaultForArea && areaUuids.includes(template.areaUuid) && template.areaUuid !== defaultAreaUuid) ??
    templates.find((template) => template.defaultForArea && template.areaUuid === defaultAreaUuid) ??
    templates.find((template) => areaUuids.includes(template.areaUuid)) ??
    templates[0]
  );
}
