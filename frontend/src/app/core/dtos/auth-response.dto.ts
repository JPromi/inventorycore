export interface AuthResponseDto {
  authenticated: boolean;
  username: string | null;
  displayName: string | null;
  role: string | null;
  permissions?: PermissionDto[];
  message?: string | null;
}

export type PermissionResourceType = 'ASSET' | 'LOCATION' | 'CATEGORY';

export interface PermissionDto {
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
