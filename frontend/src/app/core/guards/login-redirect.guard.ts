import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../service/auth.service';

@Injectable({ providedIn: 'root' })
export class LoginRedirectGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): Observable<boolean> {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.router.navigate(['/']);
      return of(false);
    }

    return this.authService.me().pipe(
      map((user) => {
        if (user) {
          this.router.navigate(['/']);
          return false;
        }

        return true;
      }),
      catchError(() => of(true))
    );
  }
}
