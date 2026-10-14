import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { PermissionResourceType } from '../entities/user.entity';
import { AreaItem } from './area.service';

export interface AdminUser {
  uuid: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
  enabled: boolean;
  groupUuids: string[];
}

export interface AdminUserRequest {
  username: string;
  displayName: string | null;
  password: string | null;
  email: string | null;
  role: string;
  enabled: boolean;
  groupUuids: string[];
}

export interface AdminGroup {
  uuid: string;
  name: string;
  sourceProvider: 'LOCAL' | 'OIDC' | 'LDAP';
  permissions: AdminPermission[];
}

export interface AdminGroupRequest {
  name: string;
  permissions: AdminPermissionRequest[];
}

export interface AdminPermissionRequest {
  /** null = all kinds of objects */
  resourceType: PermissionResourceType | null;
  areaUuid: string | null;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canInspect: boolean;
  admin: boolean;
}

export interface AdminPermission extends AdminPermissionRequest {
  uuid: string;
}

export interface AdminAreaRequest {
  name: string;
  description: string | null;
  color: string | null;
  defaultArea: boolean;
}

export function resourceTypeLabel(type: PermissionResourceType | null): string {
  return type ? RESOURCE_TYPE_LABELS[type] : 'Alle Objektarten';
}

export const RESOURCE_TYPE_LABELS: Record<PermissionResourceType, string> = {
  ASSET: 'Inventar',
  LOCATION: 'Standorte',
  ASSET_TYPE: 'Typen & Tags',
};

export type PermissionFlag = 'canView' | 'canCreate' | 'canEdit' | 'canDelete' | 'canInspect' | 'admin';

export const PERMISSION_FLAGS: { key: PermissionFlag; label: string }[] = [
  { key: 'canView', label: 'Ansehen' },
  { key: 'canCreate', label: 'Erstellen' },
  { key: 'canEdit', label: 'Bearbeiten' },
  { key: 'canDelete', label: 'Löschen' },
  { key: 'canInspect', label: 'Prüfen' },
  { key: 'admin', label: 'Admin' },
];

export const PERMISSION_PRESETS: { key: string; label: string; flags: PermissionFlag[] }[] = [
  { key: 'read', label: 'Nur ansehen', flags: ['canView'] },
  { key: 'write', label: 'Ansehen & bearbeiten', flags: ['canView', 'canCreate', 'canEdit'] },
  { key: 'full', label: 'Vollzugriff', flags: ['canView', 'canCreate', 'canEdit', 'canDelete', 'canInspect'] },
  { key: 'admin', label: 'Admin', flags: ['canView', 'canCreate', 'canEdit', 'canDelete', 'canInspect', 'admin'] },
];

export function applyPreset(permission: AdminPermissionRequest, presetKey: string): void {
  const preset = PERMISSION_PRESETS.find((entry) => entry.key === presetKey);
  if (!preset) {
    return;
  }
  PERMISSION_FLAGS.forEach((flag) => (permission[flag.key] = preset.flags.includes(flag.key)));
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly apiUrl = `${environment.apiUrl}/admin`;
  private readonly options = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

  areas(): Observable<AreaItem[]> {
    return this.http.get<AreaItem[]>(`${this.apiUrl}/areas`, this.options);
  }

  createArea(request: AdminAreaRequest): Observable<AreaItem> {
    return this.http.post<AreaItem>(`${this.apiUrl}/areas`, request, this.options);
  }

  updateArea(uuid: string, request: AdminAreaRequest): Observable<AreaItem> {
    return this.http.patch<AreaItem>(`${this.apiUrl}/areas/${uuid}`, request, this.options);
  }

  deleteArea(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/areas/${uuid}`, this.options);
  }

  users(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.apiUrl}/users`, this.options);
  }

  createUser(request: AdminUserRequest): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.apiUrl}/users`, request, this.options);
  }

  updateUser(uuid: string, request: AdminUserRequest): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.apiUrl}/users/${uuid}`, request, this.options);
  }

  deleteUser(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${uuid}`, this.options);
  }

  groups(): Observable<AdminGroup[]> {
    return this.http.get<AdminGroup[]>(`${this.apiUrl}/groups`, this.options);
  }

  createGroup(request: AdminGroupRequest): Observable<AdminGroup> {
    return this.http.post<AdminGroup>(`${this.apiUrl}/groups`, request, this.options);
  }

  updateGroup(uuid: string, request: AdminGroupRequest): Observable<AdminGroup> {
    return this.http.patch<AdminGroup>(`${this.apiUrl}/groups/${uuid}`, request, this.options);
  }

  deleteGroup(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/groups/${uuid}`, this.options);
  }

  createPermission(groupUuid: string, request: AdminPermissionRequest): Observable<AdminPermission> {
    return this.http.post<AdminPermission>(`${this.apiUrl}/groups/${groupUuid}/permissions`, request, this.options);
  }

  updatePermission(uuid: string, request: AdminPermissionRequest): Observable<AdminPermission> {
    return this.http.patch<AdminPermission>(`${this.apiUrl}/permissions/${uuid}`, request, this.options);
  }

  deletePermission(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/permissions/${uuid}`, this.options);
  }
}
