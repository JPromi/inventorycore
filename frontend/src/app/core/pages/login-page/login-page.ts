import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideBoxes,
  LucideEye,
  LucideEyeOff,
  LucideLayers,
  LucideLoaderCircle,
  LucideLock,
  LucideLogIn,
  LucideMapPin,
  LucideQrCode,
  LucideUser,
} from '@lucide/angular';

import { AuthService } from '../../service/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, LucideBoxes, LucideEye, LucideEyeOff, LucideLayers, LucideLoaderCircle, LucideLock, LucideLogIn, LucideMapPin, LucideQrCode, LucideUser],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage implements OnInit {
  protected username = '';
  protected password = '';
  protected showPassword = false;
  protected loading = false;
  protected error = '';
  protected readonly year = new Date().getFullYear();

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    if (this.authService.getCurrentUser()) {
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  /** Page the user originally wanted to open (set by the AuthGuard). */
  private get returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    // only allow app internal paths
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  }

  protected loginWithLocal(): void {
    if (this.loading) {
      return;
    }
    const username = this.username.trim();
    if (!username || !this.password) {
      this.error = 'Bitte Benutzername und Passwort eingeben.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.authService.login(username, this.password).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl),
      error: (error) => {
        this.loading = false;
        this.password = '';
        this.error =
          error?.status === 0
            ? 'Server nicht erreichbar. Bitte später erneut versuchen.'
            : 'Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.';
      },
    });
  }
}
