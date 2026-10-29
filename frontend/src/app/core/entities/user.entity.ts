export interface UserEntity {
  /** missing in sessions from before the field existed */
  uuid?: string | null;
  username: string;
  displayName: string;
  authProvider: 'LOCAL' | 'OIDC' | 'LDAP';
  profileImageUrl?: string | null;
  role: string;
  permissions: UserPermissionEntity[];
  isLoggedIn: boolean;
}

export type PermissionResourceType = 'ASSET' | 'LOCATION' | 'ASSET_TYPE' | 'TASK';

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
