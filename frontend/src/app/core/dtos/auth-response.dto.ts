export interface AuthResponseDto {
  authenticated: boolean;
  uuid?: string | null;
  username: string | null;
  displayName: string | null;
  sourceProvider?: 'LOCAL' | 'OIDC' | 'LDAP';
  profileImageUrl?: string | null;
  role: string | null;
  permissions?: PermissionDto[];
  message?: string | null;
}

export type PermissionResourceType = 'ASSET' | 'LOCATION' | 'ASSET_TYPE';

export interface PermissionDto {
  uuid: string;
  /** null = all kinds of objects */
  resourceType: PermissionResourceType | null;
  areaUuid: string | null;
  canView: boolean;
  canEdit: boolean;
  canInspect: boolean;
  canDelete: boolean;
  admin: boolean;
  canCreate: boolean;
}
