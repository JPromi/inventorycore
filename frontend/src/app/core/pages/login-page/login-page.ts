import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideBoxes,
  LucideEye,
  LucideEyeOff,
  LucideKeyRound,
  LucideLayers,
  LucideLoaderCircle,
  LucideLock,
  LucideLogIn,
  LucideMapPin,
  LucideQrCode,
  LucideUser,
} from '@lucide/angular';

import { AuthService, LoginProviders } from '../../service/auth.service';
import { CustomizationService } from '../../service/customization.service';

/** Messages for the ?error= codes the backend sends after a rejected SSO login. */
const SSO_ERRORS: Record<string, string> = {
  oidc_local_user: 'Lokale Konten können sich nicht per SSO anmelden. Bitte mit Benutzername und Passwort anmelden.',
  oidc_unknown_user: 'Für dieses SSO-Konto gibt es keinen Benutzer. Bitte an einen Administrator wenden.',
  oidc_provider_mismatch: 'Dieses Konto stammt aus einem anderen Verzeichnis und darf sich nicht per SSO anmelden.',
  oidc_disabled_user: 'Dieses Konto ist deaktiviert.',
  oidc_no_username: 'Der Identity Provider hat keinen Benutzernamen geliefert.',
  oidc_failed: 'SSO-Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
};

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, LucideBoxes, LucideEye, LucideEyeOff, LucideKeyRound, LucideLayers, LucideLoaderCircle, LucideLock, LucideLogIn, LucideMapPin, LucideQrCode, LucideUser],
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
  protected providers: LoginProviders | null = null;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    protected readonly customization: CustomizationService,
  ) {}

  ngOnInit(): void {
    if (this.authService.getCurrentUser()) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
    const errorCode = this.route.snapshot.queryParamMap.get('error');
    if (errorCode) {
      this.error = SSO_ERRORS[errorCode] ?? SSO_ERRORS['oidc_failed'];
    }
    this.authService.providers().subscribe((providers) => (this.providers = providers));
  }

  /** The SSO login is a full page redirect to the identity provider. */
  protected loginWithSso(): void {
    if (this.providers?.oidcLoginUrl) {
      this.loading = true;
      window.location.href = this.providers.oidcLoginUrl;
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
