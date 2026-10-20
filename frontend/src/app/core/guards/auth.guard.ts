import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../service/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Observable<boolean | UrlTree> {
    if (this.authService.getCurrentUser()) {
      return of(true);
    }

    return this.authService.me().pipe(
      map((user) => (user ? true : this.loginUrl(state.url))),
      catchError(() => of(this.loginUrl(state.url))),
    );
  }

  /** Remembers the requested page so the user returns there after logging in. */
  private loginUrl(returnUrl: string): UrlTree {
    const queryParams =
      returnUrl && returnUrl !== '/' && !returnUrl.startsWith('/login') ? { returnUrl } : {};
    return this.router.createUrlTree(['/login'], { queryParams });
  }
}
