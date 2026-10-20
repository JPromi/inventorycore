import { Injectable } from '@angular/core';

import { PermissionResourceType, UserPermissionEntity } from '../entities/user.entity';
import { AuthStateService } from './auth-state.service';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'inspect';

/**
 * Mirrors the backend rules for showing/hiding UI actions. The backend stays the authority:
 * lists only contain visible objects and every change is checked again there.
 *
 * A permission applies to one area or, without area, to all areas, and to one kind of
 * object or, without resource type, to all kinds.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private readonly authState: AuthStateService) {}

  get isAdmin(): boolean {
    return this.authState.getCurrentUser()?.role?.toUpperCase() === 'ADMIN';
  }

  /**
   * Without `areaUuids` the question is "allowed in any area?" (e.g. show a "new" button),
   * with `areaUuids` it is "allowed for an object in these areas?".
   */
  can(
    resourceType: PermissionResourceType,
    action: PermissionAction,
    areaUuids?: string[] | null,
  ): boolean {
    if (this.isAdmin) {
      return true;
    }
    return this.matching(resourceType, action).some(
      (permission) => !areaUuids || !permission.areaUuid || areaUuids.includes(permission.areaUuid),
    );
  }

  /** Allowed for all areas at once (a permission without area), e.g. for global tags. */
  canEverywhere(resourceType: PermissionResourceType, action: PermissionAction): boolean {
    return (
      this.isAdmin || this.matching(resourceType, action).some((permission) => !permission.areaUuid)
    );
  }

  /** The logged-in user's UUID. */
  get userUuid(): string | null {
    return this.authState.getCurrentUser()?.uuid ?? null;
  }

  /** Allowed in this specific area. */
  canInArea(
    resourceType: PermissionResourceType,
    action: PermissionAction,
    areaUuid: string,
  ): boolean {
    return this.can(resourceType, action, [areaUuid]);
  }

  private matching(
    resourceType: PermissionResourceType,
    action: PermissionAction,
  ): UserPermissionEntity[] {
    const user = this.authState.getCurrentUser();
    if (!user) {
      return [];
    }
    return user.permissions.filter(
      (permission) =>
        (!permission.resourceType || permission.resourceType === resourceType) &&
        (permission.admin || this.hasAction(permission, action)),
    );
  }

  private hasAction(permission: UserPermissionEntity, action: PermissionAction): boolean {
    switch (action) {
      case 'view':
        return permission.canView;
      case 'create':
        return permission.canCreate;
      case 'edit':
        return permission.canEdit;
      case 'delete':
        return permission.canDelete;
      case 'inspect':
        return permission.canInspect;
    }
  }
}
