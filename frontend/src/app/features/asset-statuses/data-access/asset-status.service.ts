import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { t } from '../../../core/i18n/i18n';

/**
 * What a status means: ACTIVE = in use, DEFECT = not usable, MISSING = not found,
 * RETIRED = out of service (shown grey, no longer due for inspections).
 */
export type AssetStatusCategory = 'ACTIVE' | 'DEFECT' | 'MISSING' | 'RETIRED';

export type AssetStatusKey =
  | 'AVAILABLE'
  | 'IN_DELIVERY'
  | 'DEFECT'
  | 'IN_REPAIR'
  | 'MISSING'
  | 'RETIRED';

export interface AssetStatus {
  uuid: string;
  /** set for the built-in statuses; their name comes from the texts */
  systemKey: AssetStatusKey | null;
  name: string;
  color: string | null;
  category: AssetStatusCategory;
  /** null for the built-in statuses, which apply to every area */
  areaUuid: string | null;
  deleted: boolean;
}

export interface AssetStatusRequest {
  name: string;
  color: string | null;
  category: AssetStatusCategory;
  areaUuid: string | null;
}

export interface AssetStatusChange {
  uuid: string;
  /** null for the first status of a new asset */
  fromStatus: AssetStatus | null;
  toStatus: AssetStatus;
  comment: string | null;
  changedAt: string;
  changedByName: string | null;
  /** set when a completed inspection set the status */
  inspectionUuid: string | null;
  inspectionTitle: string | null;
}

const BUILT_IN_NAMES: Record<AssetStatusKey, string> = {
  AVAILABLE: t('assetStatus.keys.AVAILABLE'),
  IN_DELIVERY: t('assetStatus.keys.IN_DELIVERY'),
  DEFECT: t('assetStatus.keys.DEFECT'),
  IN_REPAIR: t('assetStatus.keys.IN_REPAIR'),
  MISSING: t('assetStatus.keys.MISSING'),
  RETIRED: t('assetStatus.keys.RETIRED'),
};

export const STATUS_CATEGORIES: { value: AssetStatusCategory; label: string; hint: string }[] = [
  { value: 'ACTIVE', label: t('assetStatus.categories.ACTIVE'), hint: t('assetStatus.categoryHints.ACTIVE') },
  { value: 'DEFECT', label: t('assetStatus.categories.DEFECT'), hint: t('assetStatus.categoryHints.DEFECT') },
  { value: 'MISSING', label: t('assetStatus.categories.MISSING'), hint: t('assetStatus.categoryHints.MISSING') },
  { value: 'RETIRED', label: t('assetStatus.categories.RETIRED'), hint: t('assetStatus.categoryHints.RETIRED') },
];

/** Name to show: the text for built-in statuses (so another language can translate it), else the own name. */
export function statusName(status: AssetStatus | null | undefined): string {
  if (!status) {
    return '';
  }
  return status.systemKey ? BUILT_IN_NAMES[status.systemKey] : status.name;
}

export function isRetired(status: AssetStatus | null | undefined): boolean {
  return status?.category === 'RETIRED';
}

/** Built-in statuses always, custom ones when their area is in the sidebar selection (empty = all). */
export function inAreaSelection(status: AssetStatus, selected: string[]): boolean {
  return !status.areaUuid || !selected.length || selected.includes(status.areaUuid);
}

/** A custom status can only be given to assets of its area. */
export function statusFitsAreas(status: AssetStatus, areaUuids: string[] | null | undefined): boolean {
  return !status.areaUuid || (areaUuids ?? []).includes(status.areaUuid);
}

@Injectable({ providedIn: 'root' })
export class AssetStatusService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  /** Built-in statuses first, then the custom ones of the areas the user can see. */
  list(): Observable<AssetStatus[]> {
    return this.http.get<AssetStatus[]>(`${this.apiUrl}/asset-statuses`, { withCredentials: true });
  }

  create(request: AssetStatusRequest): Observable<AssetStatus> {
    return this.http.post<AssetStatus>(`${this.apiUrl}/asset-statuses`, request, { withCredentials: true });
  }

  update(uuid: string, request: AssetStatusRequest): Observable<AssetStatus> {
    return this.http.patch<AssetStatus>(`${this.apiUrl}/asset-statuses/${uuid}`, request, {
      withCredentials: true,
    });
  }

  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/asset-statuses/${uuid}`, { withCredentials: true });
  }

  history(assetUuid: string): Observable<AssetStatusChange[]> {
    return this.http.get<AssetStatusChange[]>(`${this.apiUrl}/assets/${assetUuid}/status-history`, {
      withCredentials: true,
    });
  }

  /** Sets the status of an asset; the answer is the updated asset. */
  change<T>(assetUuid: string, statusUuid: string, comment: string | null): Observable<T> {
    return this.http.post<T>(
      `${this.apiUrl}/assets/${assetUuid}/status`,
      { statusUuid, comment },
      { withCredentials: true },
    );
  }
}
