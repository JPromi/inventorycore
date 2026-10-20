import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Page, pageParams } from '../../../shared/util/paged-list';
import { PermissionResourceType } from '../../../core/entities/user.entity';
import { AreaItem } from '../../../core/service/area.service';
import { t } from '../../../core/i18n/i18n';

export interface AdminUser {
  uuid: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
  enabled: boolean;
  groupUuids: string[];
  sourceProvider: AuthProvider;
  profileImageUrl?: string | null;
}

export type AuthProvider = 'LOCAL' | 'OIDC' | 'LDAP';

export const PROVIDER_LABELS: Record<AuthProvider, string> = {
  LOCAL: 'Lokal',
  LDAP: 'LDAP',
  OIDC: 'OIDC',
};

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
  sourceProvider: AuthProvider;
  permissions: AdminPermission[];
  adminGroup: boolean;
  /** the built-in group "Alle Benutzer": every user belongs to it automatically */
  everyone: boolean;
}

/** A group in the admin list (`/admin/groups/page`). */
export interface AdminGroupRow extends AdminGroup {
  memberCount: number;
  /** the first few members, for the avatars */
  members: AdminUser[];
}

export interface AdminGroupRequest {
  name: string;
  permissions: AdminPermissionRequest[];
  adminGroup: boolean;
}

export interface LdapSettings {
  enabled: boolean;
  url: string | null;
  ignoreCertificates: boolean;
  bindDn: string | null;
  /** write only; empty keeps the stored password */
  bindPassword: string | null;
  bindPasswordSet: boolean;
  baseDn: string | null;
  userSearchBase: string | null;
  userFilter: string | null;
  usernameAttribute: string | null;
  displayNameAttribute: string | null;
  emailAttribute: string | null;
  groupSearchBase: string | null;
  groupFilter: string | null;
  groupNameAttribute: string | null;
  groupMemberAttribute: string | null;
  loginEnabled: boolean;
  disableMissingUsers: boolean;
  syncIntervalValue: number;
  syncIntervalUnit: 'MINUTES' | 'HOURS' | 'DAYS';
  lastSyncAt?: string | null;
  lastSyncResult?: string | null;
}

export interface LdapTestResult {
  success: boolean;
  message: string;
  userCount: number | null;
  groupCount: number | null;
  sampleUsers: string[];
  sampleGroups: string[];
  availableGroups?: string[];
  effectiveGroupFilter?: string | null;
}

export interface LdapSyncResult {
  success: boolean;
  message: string;
  usersCreated: number;
  usersUpdated: number;
  usersDisabled: number;
  usersSkipped: number;
  groupsCreated: number;
  groupsUpdated: number;
  groupsDeleted: number;
}

export interface OidcSettings {
  enabled: boolean;
  buttonLabel: string | null;
  issuerUri: string | null;
  clientId: string | null;
  /** write only; empty keeps the stored secret */
  clientSecret: string | null;
  clientSecretSet: boolean;
  scopes: string | null;
  usernameClaim: string | null;
  displayNameClaim: string | null;
  emailClaim: string | null;
  groupsClaim: string | null;
  autoCreateUsers: boolean;
  syncGroups: boolean;
  crossProviderLogin: boolean;
  /** the login page goes straight to the identity provider; /login?direct=1 skips it */
  autoRedirect: boolean;
  publicUrl: string | null;
  redirectUri?: string | null;
}

export interface OidcTestResult {
  success: boolean;
  message: string;
  issuer: string | null;
  authorizationEndpoint: string | null;
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
  return type ? RESOURCE_TYPE_LABELS[type] : t('services.permissions.allResourceTypes');
}

export const RESOURCE_TYPE_LABELS: Record<PermissionResourceType, string> = {
  ASSET: t('services.permissions.resourceTypes.ASSET'),
  LOCATION: t('services.permissions.resourceTypes.LOCATION'),
  ASSET_TYPE: t('services.permissions.resourceTypes.ASSET_TYPE'),
};

export type PermissionFlag =
  'canView' | 'canCreate' | 'canEdit' | 'canDelete' | 'canInspect' | 'admin';

export const PERMISSION_FLAGS: { key: PermissionFlag; label: string }[] = [
  { key: 'canView', label: t('services.permissions.flags.canView') },
  { key: 'canCreate', label: t('services.permissions.flags.canCreate') },
  { key: 'canEdit', label: t('services.permissions.flags.canEdit') },
  { key: 'canDelete', label: t('services.permissions.flags.canDelete') },
  { key: 'canInspect', label: t('services.permissions.flags.canInspect') },
  { key: 'admin', label: t('services.permissions.flags.admin') },
];

export const PERMISSION_PRESETS: { key: string; label: string; flags: PermissionFlag[] }[] = [
  { key: 'read', label: t('services.permissions.presets.read'), flags: ['canView'] },
  {
    key: 'write',
    label: t('services.permissions.presets.write'),
    flags: ['canView', 'canCreate', 'canEdit'],
  },
  {
    key: 'full',
    label: t('services.permissions.presets.full'),
    flags: ['canView', 'canCreate', 'canEdit', 'canDelete', 'canInspect'],
  },
  {
    key: 'admin',
    label: t('services.permissions.presets.admin'),
    flags: ['canView', 'canCreate', 'canEdit', 'canDelete', 'canInspect', 'admin'],
  },
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

  ldapSettings(): Observable<LdapSettings> {
    return this.http.get<LdapSettings>(`${this.apiUrl}/ldap`, this.options);
  }

  saveLdapSettings(settings: LdapSettings): Observable<LdapSettings> {
    return this.http.put<LdapSettings>(`${this.apiUrl}/ldap`, settings, this.options);
  }

  testLdap(settings: LdapSettings): Observable<LdapTestResult> {
    return this.http.post<LdapTestResult>(`${this.apiUrl}/ldap/test`, settings, this.options);
  }

  syncLdap(): Observable<LdapSyncResult> {
    return this.http.post<LdapSyncResult>(`${this.apiUrl}/ldap/sync`, null, this.options);
  }

  oidcSettings(): Observable<OidcSettings> {
    return this.http.get<OidcSettings>(`${this.apiUrl}/oidc`, this.options);
  }

  saveOidcSettings(settings: OidcSettings): Observable<OidcSettings> {
    return this.http.put<OidcSettings>(`${this.apiUrl}/oidc`, settings, this.options);
  }

  testOidc(settings: OidcSettings): Observable<OidcTestResult> {
    return this.http.post<OidcTestResult>(`${this.apiUrl}/oidc/test`, settings, this.options);
  }

  /** `status`: enabled, disabled or admin. */
  userPage(
    filter: { q?: string; group?: string | null; status?: string | null },
    page: number,
    size: number,
  ): Observable<Page<AdminUser>> {
    return this.http.get<Page<AdminUser>>(`${this.apiUrl}/users/page`, {
      ...this.options,
      params: pageParams(filter, page, size),
    });
  }

  /** Groups with member count and the first members; the search also finds groups by member. */
  groupPage(query: string, page: number, size: number): Observable<Page<AdminGroupRow>> {
    return this.http.get<Page<AdminGroupRow>>(`${this.apiUrl}/groups/page`, {
      ...this.options,
      params: pageParams({ q: query }, page, size),
    });
  }

  areaPage(query: string, page: number, size: number): Observable<Page<AreaItem>> {
    return this.http.get<Page<AreaItem>>(`${this.apiUrl}/areas/page`, {
      ...this.options,
      params: pageParams({ q: query }, page, size),
    });
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

  createPermission(
    groupUuid: string,
    request: AdminPermissionRequest,
  ): Observable<AdminPermission> {
    return this.http.post<AdminPermission>(
      `${this.apiUrl}/groups/${groupUuid}/permissions`,
      request,
      this.options,
    );
  }

  updatePermission(uuid: string, request: AdminPermissionRequest): Observable<AdminPermission> {
    return this.http.patch<AdminPermission>(
      `${this.apiUrl}/permissions/${uuid}`,
      request,
      this.options,
    );
  }

  deletePermission(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/permissions/${uuid}`, this.options);
  }
}
