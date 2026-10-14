import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, finalize, map, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthLoginRequestDto } from '../dtos/auth-login-request.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { UserEntity } from '../entities/user.entity';
import { AuthStateService } from './auth-state.service';

export interface LoginProviders {
  oidcEnabled: boolean;
  oidcLabel: string;
  oidcLoginUrl: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly backendUrl = environment.apiUrl;

  constructor(
    private readonly http: HttpClient,
    private readonly authState: AuthStateService,
  ) {}

  initializeSession(): Observable<UserEntity | null> {
    return this.me();
  }

  login(username: string, password: string): Observable<UserEntity> {
    const request: AuthLoginRequestDto = {
      username: username.trim(),
      password,
    };

    return this.http.post<AuthResponseDto>(`${this.backendUrl}/auth`, request, { withCredentials: true }).pipe(
      map((payload) => {
        if (!payload.authenticated || !payload.username) {
          throw new Error(payload.message || 'Invalid credentials');
        }

        const user = this.toUser(payload);
        this.authState.setCurrentUser(user);
        return user;
      }),
      catchError((error) => {
        this.authState.clearCurrentUser();
        return throwError(() => error);
      })
    );
  }

  me(): Observable<UserEntity | null> {
    return this.http.get<AuthResponseDto>(`${this.backendUrl}/auth/me`, { withCredentials: true }).pipe(
      map((payload) => {
        if (!payload.authenticated || !payload.username) {
          this.authState.clearCurrentUser();
          return null;
        }

        const user = this.toUser(payload);
        this.authState.setCurrentUser(user);
        return user;
      }),
      catchError(() => {
        this.authState.clearCurrentUser();
        return of(null);
      })
    );
  }

  /** Login options shown on the login page (e.g. SSO button). */
  providers(): Observable<LoginProviders> {
    return this.http
      .get<LoginProviders>(`${this.backendUrl}/auth/providers`, { withCredentials: true })
      .pipe(catchError(() => of({ oidcEnabled: false, oidcLabel: 'SSO', oidcLoginUrl: '' })));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.backendUrl}/auth/logout`, null, { withCredentials: true }).pipe(
      finalize(() => this.authState.clearCurrentUser())
    );
  }

  getCurrentUser(): UserEntity | null {
    return this.authState.getCurrentUser();
  }

  private toUser(payload: AuthResponseDto): UserEntity {
    return {
      username: payload.username ?? 'unknown',
      authProvider: 'LOCAL',
      displayName: payload.displayName ?? 'unknown',
      role: payload.role ?? 'USER',
      permissions: payload.permissions ?? [],
      isLoggedIn: true,
    };
  }
}
