import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { UserEntity } from '../entities/user.entity';

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly currentUserSubject = new BehaviorSubject<UserEntity | null>(null);

  readonly currentUser$: Observable<UserEntity | null> = this.currentUserSubject.asObservable();

  setCurrentUser(user: UserEntity | null): void {
    this.currentUserSubject.next(user);
  }

  getCurrentUser(): UserEntity | null {
    return this.currentUserSubject.value;
  }

  clearCurrentUser(): void {
    this.currentUserSubject.next(null);
  }
}
