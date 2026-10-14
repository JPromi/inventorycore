import { Injectable } from '@angular/core';

import { PermissionResourceType, UserEntity, UserPermissionEntity } from '../entities/user.entity';
import { AuthStateService } from './auth-state.service';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'inspect';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private readonly authState: AuthStateService) {}

  can(resourceType: PermissionResourceType, action: PermissionAction, resourceUuid?: string | null): boolean {
    const user = this.authState.getCurrentUser();
    if (!user) {
      return false;
    }

    if (user.role.toUpperCase() === 'ADMIN') {
      return true;
    }

    return user.permissions
      .filter((permission) => permission.resourceType === resourceType)
      .filter((permission) => !permission.resourceUuid || !resourceUuid || permission.resourceUuid === resourceUuid)
      .some((permission) => permission.admin || this.hasAction(permission, action));
  }

  filterVisible<T extends { uuid: string }>(items: T[], resourceType: PermissionResourceType): T[] {
    const user = this.authState.getCurrentUser();
    if (!user || user.role.toUpperCase() === 'ADMIN') {
      return items;
    }

    const hasGlobalView = user.permissions.some(
      (permission) => permission.resourceType === resourceType && !permission.resourceUuid && (permission.canView || permission.admin),
    );
    if (hasGlobalView) {
      return items;
    }

    return items.filter((item) => this.can(resourceType, 'view', item.uuid));
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
