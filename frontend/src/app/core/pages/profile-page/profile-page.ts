import { AsyncPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { LucideUpload, LucideTrash2 } from '@lucide/angular';
import { switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../service/auth.service';
import { AuthStateService } from '../../service/auth-state.service';

@Component({
  selector: 'app-profile-page',
  imports: [AsyncPipe, LucideUpload, LucideTrash2],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  protected busy = false;
  protected error = '';
  protected imageFailed = false;

  constructor(
    protected readonly state: AuthStateService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
  ) {}

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy) return;
    if (file.size > 5 * 1024 * 1024) {
      this.error = 'Das Profilbild darf maximal 5 MB gross sein.';
      return;
    }
    const data = new FormData();
    data.append('file', file);
    this.update(this.http.post(`${environment.apiUrl}/auth/me/profile-image`, data, { withCredentials: true }));
  }

  protected remove(): void {
    if (this.busy) return;
    this.update(this.http.delete(`${environment.apiUrl}/auth/me/profile-image`, { withCredentials: true }));
  }

  private update(request: import('rxjs').Observable<unknown>): void {
    this.busy = true;
    this.error = '';
    request.pipe(switchMap(() => this.auth.me())).subscribe({
      next: () => { this.busy = false; this.imageFailed = false; },
      error: () => { this.busy = false; this.error = 'Das Profilbild konnte nicht gespeichert werden.'; },
    });
  }
}
