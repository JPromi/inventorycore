import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { PermissionService } from '../service/permission.service';

/**
 * Configuration pages only for users who may maintain the configuration. Runs after AuthGuard;
 * the backend checks every change again.
 */
export const configGuard: CanActivateFn = () =>
  inject(PermissionService).canConfigure ? true : inject(Router).createUrlTree(['/dashboard']);
