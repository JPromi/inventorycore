export interface UserEntity {
  username: string;
  displayName: string;
  authProvider: 'LOCAL' | 'OIDC' | 'LDAP';
  role: string;
  permissions: UserPermissionEntity[];
  isLoggedIn: boolean;
}

export type PermissionResourceType = 'ASSET' | 'LOCATION' | 'CATEGORY';

export interface UserPermissionEntity {
  uuid: string;
  resourceType: PermissionResourceType;
  resourceUuid: string | null;
  canView: boolean;
  canEdit: boolean;
  canInspect: boolean;
  canDelete: boolean;
  admin: boolean;
  canCreate: boolean;
}
