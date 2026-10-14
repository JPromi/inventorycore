import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AssetFieldType } from './inventory-api.service';

export type InspectionStatus = 'OPEN' | 'COMPLETED';
/** Inventory: PRESENT/MISSING; single checks: PASSED (in order) / FAILED (defect). */
export type InspectionItemStatus = 'PENDING' | 'PRESENT' | 'MISSING' | 'PASSED' | 'FAILED';
export type InspectionCheckMethod = 'SCAN' | 'MANUAL';
export type InspectionScanOutcome =
  | 'CHECKED'
  | 'ALREADY_CHECKED'
  | 'UNEXPECTED'
  | 'UNKNOWN'
  | 'IGNORED'
  | 'OPENED'
  | 'ADDED'
  | 'ADDED_OTHER_TYPE';
/** INVENTORY: fixed list from filters, present/missing. CHECK: devices are checked one by one. */
export type InspectionMode = 'INVENTORY' | 'CHECK';
export type IntervalUnit = 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';
export type DueState = 'OVERDUE' | 'DUE' | 'OK';

export const INTERVAL_UNITS: { value: IntervalUnit; label: string; singular: string }[] = [
  { value: 'DAYS', label: 'Tage', singular: 'Tag' },
  { value: 'WEEKS', label: 'Wochen', singular: 'Woche' },
  { value: 'MONTHS', label: 'Monate', singular: 'Monat' },
  { value: 'YEARS', label: 'Jahre', singular: 'Jahr' },
];

/** "alle 6 Wochen", "jährlich" */
export function intervalText(value: number | null | undefined, unit: IntervalUnit | null | undefined): string {
  if (!value || !unit) {
    return '';
  }
  if (value === 1) {
    return { DAYS: 'täglich', WEEKS: 'wöchentlich', MONTHS: 'monatlich', YEARS: 'jährlich' }[unit];
  }
  return `alle ${value} ${INTERVAL_UNITS.find((entry) => entry.value === unit)?.label ?? ''}`;
}

/** "überfällig seit 3 Tagen", "heute fällig", "in 12 Tagen" */
export function dueText(days: number): string {
  if (days < 0) {
    return `überfällig seit ${-days} ${-days === 1 ? 'Tag' : 'Tagen'}`;
  }
  if (days === 0) {
    return 'heute fällig';
  }
  return days === 1 ? 'morgen fällig' : `fällig in ${days} Tagen`;
}

/** Due date of one recurring inspection for one asset. */
export interface InspectionDue {
  assetUuid: string;
  assetName: string;
  invId: string | null;
  assetTypeName: string | null;
  locationName: string | null;
  inspectionTypeUuid: string;
  inspectionTypeName: string;
  inspectionTypeColor: string | null;
  intervalValue: number | null;
  intervalUnit: IntervalUnit | null;
  lastCheckedAt: string | null;
  lastCheckedByName: string | null;
  lastResult: InspectionItemStatus | null;
  nextDueDate: string;
  /** set when a fixed date replaces the interval */
  fixedDueDate: string | null;
  state: DueState;
  daysUntilDue: number;
}

export const CHECK_FIELD_TYPES: { value: AssetFieldType; label: string }[] = [
  { value: 'BOOLEAN', label: 'Ja / Nein' },
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Zahl' },
  { value: 'SELECT', label: 'Auswahl' },
  { value: 'DATE', label: 'Datum' },
  { value: 'DATETIME', label: 'Datum & Zeit' },
  { value: 'URL', label: 'Link' },
  { value: 'EMAIL', label: 'E-Mail' },
];

export interface InspectionField {
  uuid?: string | null;
  /** null = for every asset of the inspection */
  assetTypeUuid: string | null;
  assetTypeName?: string | null;
  name: string;
  fieldType: AssetFieldType;
  /** JSON array of strings, for SELECT fields */
  optionsJson?: string | null;
  required: boolean;
  sortOrder: number;
}

export interface InspectionType {
  uuid: string;
  name: string;
  description?: string | null;
  color?: string | null;
  mode: InspectionMode;
  intervalValue: number | null;
  intervalUnit: IntervalUnit | null;
  /** empty = all assets */
  assetTypeUuids: string[];
  assetTypeNames: string[];
  fields: InspectionField[];
  inspectionCount: number;
}

export interface InspectionTypeRequest {
  name: string;
  description?: string | null;
  color?: string | null;
  mode: InspectionMode;
  intervalValue: number | null;
  intervalUnit: IntervalUnit | null;
  assetTypeUuids: string[];
  fields: InspectionField[];
}

export interface InspectionFilter {
  locationUuid: string | null;
  includeSubLocations: boolean;
  tagUuids: string[];
  assetTypeUuids: string[];
  areaUuids: string[];
}

export interface InspectionCounts {
  expected: number;
  present: number;
  missing: number;
  passed: number;
  failed: number;
  pending: number;
  unexpected: number;
}

export interface InspectionSummary {
  uuid: string;
  title: string;
  inspectionTypeUuid: string | null;
  typeName: string;
  status: InspectionStatus;
  mode: InspectionMode;
  filterSummary: string | null;
  createdAt: string;
  createdByName: string | null;
  completedAt: string | null;
  completedByName: string | null;
  counts: InspectionCounts;
}

export interface InspectionItemValue {
  fieldUuid: string;
  fieldName: string;
  fieldType: AssetFieldType | null;
  value: string;
}

export interface InspectionItem {
  uuid: string;
  assetUuid: string | null;
  assetName: string;
  invId: string | null;
  serialNumber: string | null;
  assetTypeUuid: string | null;
  assetTypeName: string | null;
  locationName: string | null;
  expected: boolean;
  status: InspectionItemStatus;
  method: InspectionCheckMethod | null;
  scannedCode: string | null;
  checkedAt: string | null;
  checkedByName: string | null;
  note: string | null;
  values: InspectionItemValue[];
  photos: InspectionPhoto[];
}

/** Photo in the protocol of an asset. */
export interface InspectionPhoto {
  uuid: string;
  fileUuid: string;
  url: string;
  thumbnailUrl: string;
  takenAt: string;
  takenByName: string | null;
}

/** INSPECTION: into the protocol, ASSET: into the asset's images. */
export type InspectionPhotoTarget = 'INSPECTION' | 'ASSET';

export interface InspectionDetail {
  summary: InspectionSummary;
  comment: string | null;
  filter: InspectionFilter;
  fields: InspectionField[];
  items: InspectionItem[];
}

export interface InspectionScanResponse {
  outcome: InspectionScanOutcome;
  message: string;
  item: InspectionItem | null;
}

/** One inspection an asset appeared in, with the result for that asset. */
export interface AssetInspection {
  inspectionUuid: string;
  title: string;
  typeName: string;
  inspectionStatus: InspectionStatus;
  createdAt: string;
  completedAt: string | null;
  expected: boolean;
  status: InspectionItemStatus;
  method: InspectionCheckMethod | null;
  checkedAt: string | null;
  checkedByName: string | null;
  locationName: string | null;
  note: string | null;
  values: InspectionItemValue[];
}

export interface InspectionItemUpdate {
  status?: InspectionItemStatus;
  note?: string;
  values?: Record<string, string>;
}

/** Choices of a SELECT field. */
export function fieldOptions(field: Pick<InspectionField, 'optionsJson'>): string[] {
  try {
    const value = JSON.parse(field.optionsJson || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

/** Readable value for the protocol, e.g. "Ja" instead of "true". */
export function formatCheckValue(value: string | null | undefined, type: AssetFieldType | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  switch (type) {
    case 'BOOLEAN':
      return value === 'true' ? 'Ja' : value === 'false' ? 'Nein' : value;
    case 'DATE':
      return new Date(value).toLocaleDateString('de-AT');
    case 'DATETIME':
      return new Date(value).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
    default:
      return value;
  }
}

@Injectable({ providedIn: 'root' })
export class InspectionService {
  private readonly apiUrl = environment.apiUrl;
  private readonly options = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

  types(): Observable<InspectionType[]> {
    return this.http.get<InspectionType[]>(`${this.apiUrl}/inspection-types`, this.options);
  }

  type(uuid: string): Observable<InspectionType> {
    return this.http.get<InspectionType>(`${this.apiUrl}/inspection-types/${uuid}`, this.options);
  }

  createType(request: InspectionTypeRequest): Observable<InspectionType> {
    return this.http.post<InspectionType>(`${this.apiUrl}/inspection-types`, request, this.options);
  }

  updateType(uuid: string, request: InspectionTypeRequest): Observable<InspectionType> {
    return this.http.put<InspectionType>(`${this.apiUrl}/inspection-types/${uuid}`, request, this.options);
  }

  deleteType(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/inspection-types/${uuid}`, this.options);
  }

  /** All inspections the asset was part of or found in, newest first. */
  inspectionsOfAsset(assetUuid: string): Observable<AssetInspection[]> {
    return this.http.get<AssetInspection[]>(`${this.apiUrl}/assets/${assetUuid}/inspections`, this.options);
  }

  inspections(): Observable<InspectionSummary[]> {
    return this.http.get<InspectionSummary[]>(`${this.apiUrl}/inspections`, this.options);
  }

  inspection(uuid: string): Observable<InspectionDetail> {
    return this.http.get<InspectionDetail>(`${this.apiUrl}/inspections/${uuid}`, this.options);
  }

  /** Number of assets an inspection would start with. */
  preview(inspectionTypeUuid: string | null, filter: InspectionFilter, onlyDue = false, dueWithinDays = 7): Observable<number> {
    return this.http
      .post<{ count: number }>(`${this.apiUrl}/inspections/preview`, { inspectionTypeUuid, filter, onlyDue, dueWithinDays }, this.options)
      .pipe(map((response) => response.count));
  }

  create(inspectionTypeUuid: string, title: string, filter: InspectionFilter, onlyDue = false, dueWithinDays = 7): Observable<InspectionDetail> {
    return this.http.post<InspectionDetail>(
      `${this.apiUrl}/inspections`,
      { inspectionTypeUuid, title, filter, onlyDue, dueWithinDays },
      this.options,
    );
  }

  /** Single checks: add a device without scanning it. */
  addItem(uuid: string, assetUuid: string): Observable<InspectionItem> {
    return this.http.post<InspectionItem>(`${this.apiUrl}/inspections/${uuid}/items`, { assetUuid }, this.options);
  }

  /** Recurring inspections of all visible assets, most urgent first. */
  schedules(): Observable<InspectionDue[]> {
    return this.http.get<InspectionDue[]>(`${this.apiUrl}/inspection-schedules`, this.options);
  }

  schedulesOfAsset(assetUuid: string): Observable<InspectionDue[]> {
    return this.http.get<InspectionDue[]>(`${this.apiUrl}/assets/${assetUuid}/inspection-schedules`, this.options);
  }

  /** `null` removes the fixed date, so the interval counts again. */
  setFixedDueDate(assetUuid: string, typeUuid: string, fixedDueDate: string | null): Observable<InspectionDue> {
    return this.http.put<InspectionDue>(`${this.apiUrl}/assets/${assetUuid}/inspection-schedules/${typeUuid}`, { fixedDueDate }, this.options);
  }

  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/inspections/${uuid}`, this.options);
  }

  scan(uuid: string, code: string): Observable<InspectionScanResponse> {
    return this.http.post<InspectionScanResponse>(`${this.apiUrl}/inspections/${uuid}/scan`, { code }, this.options);
  }

  updateItem(uuid: string, itemUuid: string, update: InspectionItemUpdate): Observable<InspectionItem> {
    return this.http.patch<InspectionItem>(`${this.apiUrl}/inspections/${uuid}/items/${itemUuid}`, update, this.options);
  }

  addPhoto(uuid: string, itemUuid: string, fileUuid: string, target: InspectionPhotoTarget): Observable<InspectionItem> {
    return this.http.post<InspectionItem>(`${this.apiUrl}/inspections/${uuid}/items/${itemUuid}/photos`, { fileUuid, target }, this.options);
  }

  removePhoto(uuid: string, itemUuid: string, photoUuid: string): Observable<InspectionItem> {
    return this.http.delete<InspectionItem>(`${this.apiUrl}/inspections/${uuid}/items/${itemUuid}/photos/${photoUuid}`, this.options);
  }

  removeItem(uuid: string, itemUuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/inspections/${uuid}/items/${itemUuid}`, this.options);
  }

  complete(uuid: string, comment: string): Observable<InspectionDetail> {
    return this.http.post<InspectionDetail>(`${this.apiUrl}/inspections/${uuid}/complete`, { comment }, this.options);
  }
}
