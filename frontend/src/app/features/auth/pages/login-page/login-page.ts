import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideBoxes,
  LucideEye,
  LucideEyeOff,
  LucideKeyRound,
  LucideLoaderCircle,
  LucideLock,
  LucideLogIn,
  LucideUser,
} from '@lucide/angular';

import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AuthService, LoginProviders } from '../../../../core/service/auth.service';
import { CustomizationService } from '../../../../core/service/customization.service';

/** Messages for the ?error= codes the backend sends after a rejected SSO login. */
const SSO_ERRORS: Record<string, string> = {
  oidc_local_user: t('login.ssoErrors.localUser'),
  oidc_unknown_user: t('login.ssoErrors.unknownUser'),
  oidc_provider_mismatch: t('login.ssoErrors.providerMismatch'),
  oidc_disabled_user: t('login.ssoErrors.disabledUser'),
  oidc_no_username: t('login.ssoErrors.noUsername'),
  oidc_failed: t('login.ssoErrors.failed'),
};

const OIDC_RETURN_URL = 'inventorycore.oidc.returnUrl';

function safeReturnUrl(url: string | null): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(url) ? url : '/';
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    FormsModule,
    LucideBoxes,
    LucideEye,
    LucideEyeOff,
    LucideKeyRound,
    LucideLoaderCircle,
    LucideLock,
    LucideLogIn,
    LucideUser,
    TranslatePipe,
  ],
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
  /** On the way to the identity provider because of the automatic redirect. */
  protected redirecting = false;
  protected readonly loggedOut: boolean;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    protected readonly customization: CustomizationService,
  ) {
    // only readable while the navigation from the logout runs
    this.loggedOut = !!this.router.currentNavigation()?.extras.state?.['loggedOut'];
  }

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('oidc') === 'success') {
      const destination = this.takeOidcReturnUrl();
      this.authService.me().subscribe(user => {
        if (user) {
          this.router.navigateByUrl(destination);
        } else {
          this.error = SSO_ERRORS['oidc_failed'];
          this.authService.providers().subscribe(providers => this.providers = providers);
          this.router.navigate(['/login'], { queryParams: { error: 'oidc_failed' }, replaceUrl: true });
        }
      });
      return;
    }
    if (this.authService.getCurrentUser()) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
    const errorCode = this.route.snapshot.queryParamMap.get('error');
    if (errorCode) {
      this.error = SSO_ERRORS[errorCode] ?? SSO_ERRORS['oidc_failed'];
    }
    this.authService.providers().subscribe((providers) => {
      this.providers = providers;
      if (this.autoRedirect(providers, !!errorCode)) {
        this.redirecting = true;
        this.loginWithSso();
      }
    });
  }

  /**
   * Like Nextcloud: with the setting on, the login page goes straight to the identity provider.
   * Not with ?direct=1 (e.g. for local admins), after a failed SSO login (that would loop) and
   * right after the logout (the provider would sign the user in again).
   */
  private autoRedirect(providers: LoginProviders, failed: boolean): boolean {
    const direct = this.route.snapshot.queryParamMap.has('direct');
    return !!providers.oidcAutoRedirect && !!providers.oidcLoginUrl && !direct && !failed && !this.loggedOut;
  }

  /** The SSO login is a full page redirect to the identity provider. */
  protected loginWithSso(): void {
    if (this.providers?.oidcLoginUrl) {
      this.loading = true;
      try {
        const requested = this.route.snapshot.queryParamMap.get('returnUrl');
        if (requested !== null) sessionStorage.setItem(OIDC_RETURN_URL, safeReturnUrl(requested));
        else if (!this.route.snapshot.queryParamMap.has('error')) sessionStorage.removeItem(OIDC_RETURN_URL);
      } catch {
        // Storage may be unavailable; the login still works and returns to the start page.
      }
      window.location.href = this.providers.oidcLoginUrl;
    }
  }

  /** Page the user originally wanted to open (set by the AuthGuard). */
  private get returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    // only allow app internal paths
    return safeReturnUrl(url);
  }

  private takeOidcReturnUrl(): string {
    try {
      const url = sessionStorage.getItem(OIDC_RETURN_URL);
      sessionStorage.removeItem(OIDC_RETURN_URL);
      return safeReturnUrl(url);
    } catch {
      return '/';
    }
  }

  protected loginWithLocal(): void {
    if (this.loading) {
      return;
    }
    const username = this.username.trim();
    if (!username || !this.password) {
      this.error = t('login.errors.missingCredentials');
      return;
    }

    this.loading = true;
    this.error = '';
    this.authService.login(username, this.password).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl),
      error: (error) => {
        this.loading = false;
        this.password = '';
        this.error = error?.status === 0 ? t('login.errors.unreachable') : t('login.errors.failed');
      },
    });
  }
}
