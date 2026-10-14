export interface UserEntity {
  username: string;
  displayName: string;
  authProvider: 'LOCAL' | 'OIDC' | 'LDAP';
  role: string;
  permissions: UserPermissionEntity[];
  isLoggedIn: boolean;
}

export type PermissionResourceType = 'ASSET' | 'LOCATION' | 'ASSET_TYPE';

export interface UserPermissionEntity {
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
