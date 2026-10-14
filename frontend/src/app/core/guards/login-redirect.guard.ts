import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../service/auth.service';

/** Logged in users do not need the login page. */
@Injectable({ providedIn: 'root' })
export class LoginRedirectGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    if (this.authService.getCurrentUser()) {
      return of(this.router.createUrlTree(['/']));
    }

    return this.authService.me().pipe(
      map((user) => (user ? this.router.createUrlTree(['/']) : true)),
      catchError(() => of(true)),
    );
  }
}
