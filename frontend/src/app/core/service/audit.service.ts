import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { t } from '../i18n/i18n';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'SCAN' | 'INSPECT' | 'PHOTO' | 'COMPLETE' | 'SYNC';
export type AuditObjectType =
  | 'ASSET'
  | 'LOCATION'
  | 'ASSET_TYPE'
  | 'TAG'
  | 'INSPECTION'
  | 'INSPECTION_TYPE'
  | 'LABEL_TEMPLATE'
  | 'USER'
  | 'GROUP'
  | 'PERMISSION'
  | 'AREA'
  | 'SETTINGS';

export interface AuditLog {
  uuid: string;
  createdAt: string;
  userUuid: string | null;
  userName: string | null;
  action: AuditAction;
  objectType: AuditObjectType;
  objectUuid: string | null;
  objectName: string | null;
  details: AuditDetail[];
}

/**
 * Language-neutral detail: a field change (field key, raw values or added / removed entries) or an
 * event (code + params). audit-text.ts turns it into text.
 */
export interface AuditDetail {
  field?: string | null;
  /** custom field of an asset: `field` is its name */
  custom?: boolean | null;
  from?: unknown;
  to?: unknown;
  added?: unknown[] | null;
  removed?: unknown[] | null;
  modified?: boolean | null;
  code?: string | null;
  params?: Record<string, unknown> | null;
}

/** Group permission inside a detail. */
export interface AuditPermission {
  resourceType: string | null;
  area: string | null;
  rights: string[];
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  size: number;
}

export interface AuditLogFilter {
  objectType?: AuditObjectType | null;
  action?: AuditAction | null;
  search?: string;
  from?: string | null;
  to?: string | null;
}

export const AUDIT_ACTIONS: { value: AuditAction; label: string }[] = [
  { value: 'CREATE', label: t('audit.actions.CREATE') },
  { value: 'UPDATE', label: t('audit.actions.UPDATE') },
  { value: 'DELETE', label: t('audit.actions.DELETE') },
  { value: 'SCAN', label: t('audit.actions.SCAN') },
  { value: 'INSPECT', label: t('audit.actions.INSPECT') },
  { value: 'PHOTO', label: t('audit.actions.PHOTO') },
  { value: 'COMPLETE', label: t('audit.actions.COMPLETE') },
  { value: 'SYNC', label: t('audit.actions.SYNC') },
];

export const AUDIT_OBJECT_TYPES: { value: AuditObjectType; label: string }[] = [
  { value: 'ASSET', label: t('terms.asset') },
  { value: 'LOCATION', label: t('terms.location') },
  { value: 'ASSET_TYPE', label: t('terms.assetType') },
  { value: 'TAG', label: t('terms.tag') },
  { value: 'INSPECTION', label: t('terms.inspection') },
  { value: 'INSPECTION_TYPE', label: t('terms.inspectionTemplate') },
  { value: 'LABEL_TEMPLATE', label: t('audit.objectTypes.LABEL_TEMPLATE') },
  { value: 'USER', label: t('terms.user') },
  { value: 'GROUP', label: t('terms.group') },
  { value: 'PERMISSION', label: t('audit.objectTypes.PERMISSION') },
  { value: 'AREA', label: t('terms.area') },
  { value: 'SETTINGS', label: t('audit.objectTypes.SETTINGS') },
];

export function auditActionLabel(action: AuditAction): string {
  return AUDIT_ACTIONS.find((entry) => entry.value === action)?.label ?? action;
}

export function auditObjectTypeLabel(type: AuditObjectType): string {
  return AUDIT_OBJECT_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

/** Page of the object, if it has one (deleted objects lead to "not found"). */
export function auditObjectRoute(log: AuditLog): string[] | null {
  if (!log.objectUuid || log.action === 'DELETE') {
    return null;
  }
  switch (log.objectType) {
    case 'ASSET':
      return ['/assets', log.objectUuid];
    case 'LOCATION':
      return ['/locations', log.objectUuid];
    case 'ASSET_TYPE':
      return ['/config/types', log.objectUuid];
    case 'INSPECTION':
      return ['/inspections', log.objectUuid];
    case 'INSPECTION_TYPE':
      return ['/config/inspection-templates', log.objectUuid];
    case 'LABEL_TEMPLATE':
      return ['/config/labels', log.objectUuid, 'edit'];
    case 'USER':
      return ['/admin/users', log.objectUuid, 'edit'];
    case 'GROUP':
    case 'PERMISSION':
      return ['/admin/groups', log.objectUuid, 'edit'];
    default:
      return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly apiUrl = environment.apiUrl;
  private readonly options = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

  /** Everything (admins only), newest first. */
  list(filter: AuditLogFilter, page = 0, size = 50): Observable<AuditLogPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filter)) {
      if (value) {
        params = params.set(key, String(value).trim());
      }
    }
    return this.http.get<AuditLogPage>(`${this.apiUrl}/audit-logs`, { ...this.options, params });
  }

  /** History of one asset or location. */
  ofObject(endpoint: 'assets' | 'locations', uuid: string, page = 0, size = 20): Observable<AuditLogPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AuditLogPage>(`${this.apiUrl}/${endpoint}/${uuid}/logs`, { ...this.options, params });
  }
}
