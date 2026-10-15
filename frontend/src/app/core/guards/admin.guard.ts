import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStateService } from '../service/auth-state.service';

/** Only users with the ADMIN role may open the administration pages. Runs after AuthGuard. */
export const adminGuard: CanActivateFn = () => {
  const user = inject(AuthStateService).getCurrentUser();
  return user?.role.toUpperCase() === 'ADMIN' ? true : inject(Router).createUrlTree(['/dashboard']);
};
