import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../service/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): Observable<boolean> {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      return of(true);
    }

    return this.authService.me().pipe(
      map((user) => {
        if (!user) {
          this.router.navigate(['/login']);
          return false;
        }

        return true;
      }),
      catchError(() => {
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
}
