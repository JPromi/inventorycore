import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Page, pageParams } from '../../../shared/util/paged-list';
import { AssetFieldType } from '../../inventory/data-access/inventory-api.service';
import { t, tn } from '../../../core/i18n/i18n';

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
  | 'ADDED_OTHER_TYPE'
  /** several assets match the code: nothing recorded, the user picks one of the candidates */
  | 'AMBIGUOUS';
/** INVENTORY: fixed list from filters, present/missing. CHECK: devices are checked one by one. */
export type InspectionMode = 'INVENTORY' | 'CHECK';
/** Function check in an inventory: the asset is there and works / is broken. */
export type InspectionCondition = 'OK' | 'DEFECT';
export type IntervalUnit = 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';
export type DueState = 'OVERDUE' | 'DUE' | 'OK';

export const INTERVAL_UNITS: { value: IntervalUnit; label: string; singular: string }[] = [
  {
    value: 'DAYS',
    label: t('services.intervalUnits.DAYS.plural'),
    singular: t('services.intervalUnits.DAYS.singular'),
  },
  {
    value: 'WEEKS',
    label: t('services.intervalUnits.WEEKS.plural'),
    singular: t('services.intervalUnits.WEEKS.singular'),
  },
  {
    value: 'MONTHS',
    label: t('services.intervalUnits.MONTHS.plural'),
    singular: t('services.intervalUnits.MONTHS.singular'),
  },
  {
    value: 'YEARS',
    label: t('services.intervalUnits.YEARS.plural'),
    singular: t('services.intervalUnits.YEARS.singular'),
  },
];

/** "alle 6 Wochen", "jährlich" */
export function intervalText(
  value: number | null | undefined,
  unit: IntervalUnit | null | undefined,
): string {
  if (!value || !unit) {
    return '';
  }
  return tn(`services.interval.${unit}`, value);
}

/** "überfällig seit 3 Tagen", "heute fällig", "in 12 Tagen" */
export function dueText(days: number): string {
  if (days < 0) {
    return tn('services.due.overdue', -days);
  }
  if (days === 0) {
    return t('services.due.today');
  }
  return days === 1 ? t('services.due.tomorrow') : t('services.due.inDays', { count: days });
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
  assetAreaUuids: string[];
}

export const CHECK_FIELD_TYPES: { value: AssetFieldType; label: string }[] = [
  { value: 'BOOLEAN', label: t('services.fieldTypes.BOOLEAN') },
  { value: 'TEXT', label: t('services.fieldTypes.TEXT') },
  { value: 'NUMBER', label: t('services.fieldTypes.NUMBER') },
  { value: 'SELECT', label: t('services.fieldTypes.SELECT') },
  { value: 'DATE', label: t('services.fieldTypes.DATE') },
  { value: 'DATETIME', label: t('services.fieldTypes.DATETIME') },
  { value: 'URL', label: t('services.fieldTypes.URL') },
  { value: 'EMAIL', label: t('services.fieldTypes.EMAIL') },
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
  /** inventory: also check whether present assets work */
  checkFunction: boolean;
  /** empty = all assets */
  assetTypeUuids: string[];
  assetTypeNames: string[];
  /** empty = all areas */
  areaUuids: string[];
  areaNames: string[];
  /** the current user may start inspections of this kind (right to inspect in its areas) */
  usable: boolean;
  /** the current user may change / delete it (rights in its areas) */
  editable: boolean;
  deletable: boolean;
  fields: InspectionField[];
  inspectionCount: number;
  protocolAreaUuid: string | null;
  defaultTagUuids: string[];
  defaultAssetTypeUuids: string[];
  defaultLocationUuids: string[];
  recurringTagUuids: string[];
  includeChildAssets: boolean;
}

export interface InspectionTypeRequest {
  protocolAreaUuid: string | null;
  defaultAssetTypeUuids: string[];
  defaultLocationUuids: string[];
  recurringTagUuids: string[];
  defaultTagUuids: string[];
  includeChildAssets: boolean;
  name: string;
  description?: string | null;
  color?: string | null;
  mode: InspectionMode;
  intervalValue: number | null;
  intervalUnit: IntervalUnit | null;
  checkFunction: boolean;
  assetTypeUuids: string[];
  areaUuids: string[];
  fields: InspectionField[];
}

export interface InspectionFilter {
  locationUuids?: string[];
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
  /** function check: present but defect / present and not checked yet */
  defect: number;
  functionUnchecked: number;
}

/** A page of protocols plus the counts for the status tabs (within the area selection). */
export interface InspectionPage extends Page<InspectionSummary> {
  openCount: number;
  completedCount: number;
}

export interface InspectionSummary {
  uuid: string;
  title: string;
  inspectionTypeUuid: string | null;
  typeName: string;
  /** areas of the inspection type, empty = all */
  areaUuids: string[];
  areaNames: string[];
  status: InspectionStatus;
  mode: InspectionMode;
  checkFunction: boolean;
  filterSummary: string | null;
  createdAt: string;
  createdByUuid?: string | null;
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
  parentAssetUuid?: string | null;
  parentAssetNote?: string | null;
  inspectionPolicy?: import('../../inventory/data-access/inventory-api.service').AssetInspectionPolicy;
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
  condition: InspectionCondition | null;
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

/** One of several assets a scanned code matches. */
export interface InspectionScanCandidate {
  uuid: string;
  name: string;
  invId: string | null;
  assetTypeName: string | null;
  locationName: string | null;
  matchedBy: 'INV_ID' | 'INVENTORY_NUMBER' | 'SERIAL_NUMBER' | null;
  /** on this inspection's list */
  inInspection: boolean;
}

export interface InspectionScanResponse {
  outcome: InspectionScanOutcome;
  message: string;
  item: InspectionItem | null;
  candidates?: InspectionScanCandidate[];
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
  condition: InspectionCondition | null;
  checkedAt: string | null;
  checkedByName: string | null;
  locationName: string | null;
  note: string | null;
  values: InspectionItemValue[];
}

export interface InspectionItemUpdate {
  status?: InspectionItemStatus;
  /** '' clears; OK / DEFECT also marks the asset as present */
  condition?: InspectionCondition | '';
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
export function formatCheckValue(
  value: string | null | undefined,
  type: AssetFieldType | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  switch (type) {
    case 'BOOLEAN':
      return value === 'true' ? t('common.yes') : value === 'false' ? t('common.no') : value;
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
    return this.http.put<InspectionType>(
      `${this.apiUrl}/inspection-types/${uuid}`,
      request,
      this.options,
    );
  }

  deleteType(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/inspection-types/${uuid}`, this.options);
  }

  /** All inspections the asset was part of or found in, newest first. */
  inspectionsOfAsset(assetUuid: string): Observable<AssetInspection[]> {
    return this.http.get<AssetInspection[]>(
      `${this.apiUrl}/assets/${assetUuid}/inspections`,
      this.options,
    );
  }

  /** Searched page of the templates; `areas` is the sidebar selection. */
  typePage(
    filter: { q?: string; areas?: string[] },
    page: number,
    size: number,
  ): Observable<Page<InspectionType>> {
    return this.http.get<Page<InspectionType>>(`${this.apiUrl}/inspection-types/page`, {
      ...this.options,
      params: pageParams(filter, page, size),
    });
  }

  /** Searched page of the protocols (newest first) with the tab counts. */
  inspectionPage(
    filter: { q?: string; status?: InspectionStatus | null; areas?: string[] },
    page: number,
    size: number,
  ): Observable<InspectionPage> {
    return this.http.get<InspectionPage>(`${this.apiUrl}/inspections/page`, {
      ...this.options,
      params: pageParams(filter, page, size),
    });
  }

  inspections(): Observable<InspectionSummary[]> {
    return this.http.get<InspectionSummary[]>(`${this.apiUrl}/inspections`, this.options);
  }

  inspection(uuid: string): Observable<InspectionDetail> {
    return this.http.get<InspectionDetail>(`${this.apiUrl}/inspections/${uuid}`, this.options);
  }

  /** Number of assets an inspection would start with. */
  preview(
    inspectionTypeUuid: string | null,
    filter: InspectionFilter,
    onlyDue = false,
    dueWithinDays = 7,
    includeChildAssets: boolean | null = null,
  ): Observable<number> {
    return this.http
      .post<{ count: number }>(
        `${this.apiUrl}/inspections/preview`,
        { inspectionTypeUuid, filter, onlyDue, dueWithinDays, includeChildAssets },
        this.options,
      )
      .pipe(map((response) => response.count));
  }

  /** `checkFunction` null = default of the type. */
  create(
    inspectionTypeUuid: string,
    title: string,
    filter: InspectionFilter,
    onlyDue = false,
    dueWithinDays = 7,
    checkFunction: boolean | null = null,
    includeChildAssets: boolean | null = null,
    areaUuid: string | null = null,
  ): Observable<InspectionDetail> {
    return this.http.post<InspectionDetail>(
      `${this.apiUrl}/inspections`,
      {
        inspectionTypeUuid,
        title,
        filter,
        onlyDue,
        dueWithinDays,
        checkFunction,
        includeChildAssets,
        areaUuid,
      },
      this.options,
    );
  }

  /** Single checks: add a device without scanning it. */
  addItem(uuid: string, assetUuid: string): Observable<InspectionItem> {
    return this.http.post<InspectionItem>(
      `${this.apiUrl}/inspections/${uuid}/items`,
      { assetUuid },
      this.options,
    );
  }

  /** Recurring inspections of all visible assets, most urgent first. */
  schedules(): Observable<InspectionDue[]> {
    return this.http.get<InspectionDue[]>(`${this.apiUrl}/inspection-schedules`, this.options);
  }

  schedulesOfAsset(assetUuid: string): Observable<InspectionDue[]> {
    return this.http.get<InspectionDue[]>(
      `${this.apiUrl}/assets/${assetUuid}/inspection-schedules`,
      this.options,
    );
  }

  /** `null` removes the fixed date, so the interval counts again. */
  setFixedDueDate(
    assetUuid: string,
    typeUuid: string,
    fixedDueDate: string | null,
  ): Observable<InspectionDue> {
    return this.http.put<InspectionDue>(
      `${this.apiUrl}/assets/${assetUuid}/inspection-schedules/${typeUuid}`,
      { fixedDueDate },
      this.options,
    );
  }

  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/inspections/${uuid}`, this.options);
  }

  /** `assetUuid`: the user's choice after an AMBIGUOUS answer. */
  scan(uuid: string, code: string, assetUuid?: string): Observable<InspectionScanResponse> {
    return this.http.post<InspectionScanResponse>(
      `${this.apiUrl}/inspections/${uuid}/scan`,
      { code, assetUuid: assetUuid ?? null },
      this.options,
    );
  }

  updateItem(
    uuid: string,
    itemUuid: string,
    update: InspectionItemUpdate,
  ): Observable<InspectionItem> {
    return this.http.patch<InspectionItem>(
      `${this.apiUrl}/inspections/${uuid}/items/${itemUuid}`,
      update,
      this.options,
    );
  }

  addPhoto(
    uuid: string,
    itemUuid: string,
    fileUuid: string,
    target: InspectionPhotoTarget,
  ): Observable<InspectionItem> {
    return this.http.post<InspectionItem>(
      `${this.apiUrl}/inspections/${uuid}/items/${itemUuid}/photos`,
      { fileUuid, target },
      this.options,
    );
  }

  removePhoto(uuid: string, itemUuid: string, photoUuid: string): Observable<InspectionItem> {
    return this.http.delete<InspectionItem>(
      `${this.apiUrl}/inspections/${uuid}/items/${itemUuid}/photos/${photoUuid}`,
      this.options,
    );
  }

  removeItem(uuid: string, itemUuid: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/inspections/${uuid}/items/${itemUuid}`,
      this.options,
    );
  }

  complete(uuid: string, comment: string): Observable<InspectionDetail> {
    return this.http.post<InspectionDetail>(
      `${this.apiUrl}/inspections/${uuid}/complete`,
      { comment },
      this.options,
    );
  }
}
