import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AssetFieldType } from './inventory-api.service';

export type InspectionStatus = 'OPEN' | 'COMPLETED';
export type InspectionItemStatus = 'PENDING' | 'PRESENT' | 'MISSING';
export type InspectionCheckMethod = 'SCAN' | 'MANUAL';
export type InspectionScanOutcome = 'CHECKED' | 'ALREADY_CHECKED' | 'UNEXPECTED' | 'UNKNOWN' | 'IGNORED';

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
  fields: InspectionField[];
  inspectionCount: number;
}

export interface InspectionTypeRequest {
  name: string;
  description?: string | null;
  color?: string | null;
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
  pending: number;
  unexpected: number;
}

export interface InspectionSummary {
  uuid: string;
  title: string;
  inspectionTypeUuid: string | null;
  typeName: string;
  status: InspectionStatus;
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
}

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

  preview(filter: InspectionFilter): Observable<number> {
    return this.http
      .post<{ count: number }>(`${this.apiUrl}/inspections/preview`, filter, this.options)
      .pipe(map((response) => response.count));
  }

  create(inspectionTypeUuid: string, title: string, filter: InspectionFilter): Observable<InspectionDetail> {
    return this.http.post<InspectionDetail>(`${this.apiUrl}/inspections`, { inspectionTypeUuid, title, filter }, this.options);
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

  removeItem(uuid: string, itemUuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/inspections/${uuid}/items/${itemUuid}`, this.options);
  }

  complete(uuid: string, comment: string): Observable<InspectionDetail> {
    return this.http.post<InspectionDetail>(`${this.apiUrl}/inspections/${uuid}/complete`, { comment }, this.options);
  }
}
