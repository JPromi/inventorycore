import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCircleCheck,
  LucideCircleX,
  LucideCopy,
  LucideKeyRound,
  LucidePlugZap,
  LucideSave,
} from '@lucide/angular';

import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AdminApiService, OidcSettings, OidcTestResult } from '../../data-access/admin-api.service';

@Component({
  selector: 'app-oidc-settings-page',
  imports: [
    FormsModule,
    TranslatePipe,
    LucideCircleCheck,
    LucideCircleX,
    LucideCopy,
    LucideKeyRound,
    LucidePlugZap,
    LucideSave,
  ],
  templateUrl: './oidc-settings-page.html',
  styleUrl: './oidc-settings-page.scss',
})
export class OidcSettingsPage implements OnInit {
  protected settings: OidcSettings | null = null;
  protected loading = false;
  protected saving = false;
  protected testing = false;
  protected saved = false;
  protected copied: 'redirect' | 'direct' | null = null;
  protected error = '';
  protected testResult: OidcTestResult | null = null;

  constructor(private readonly api: AdminApiService) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.oidcSettings().subscribe({
      next: (settings) => {
        this.settings = { ...settings, clientSecret: '' };
        this.loading = false;
      },
      error: () => {
        this.error = t('adminOidc.errors.load');
        this.loading = false;
      },
    });
  }

  /** Redirect URI as the browser sees it (the backend only knows "{baseUrl}" without public URL). */
  protected get redirectUri(): string {
    return `${this.baseUrl}/login/oauth2/code/oidc`;
  }

  /** Normal login page while the automatic redirect is on. */
  protected get directLoginUrl(): string {
    return `${this.baseUrl}/login?direct=1`;
  }

  private get baseUrl(): string {
    return this.settings?.publicUrl?.trim().replace(/\/+$/, '') || window.location.origin;
  }

  protected changed(): void {
    this.saved = false;
  }

  protected async copy(which: 'redirect' | 'direct'): Promise<void> {
    try {
      await navigator.clipboard.writeText(which === 'redirect' ? this.redirectUri : this.directLoginUrl);
      this.copied = which;
      setTimeout(() => (this.copied = null), 2000);
    } catch {
      // clipboard not available (e.g. http); the value is visible anyway
    }
  }

  protected save(): void {
    if (!this.settings || this.saving) {
      return;
    }
    this.saving = true;
    this.error = '';
    this.api.saveOidcSettings(this.settings).subscribe({
      next: (settings) => {
        this.settings = { ...settings, clientSecret: '' };
        this.saving = false;
        this.saved = true;
      },
      error: () => {
        this.saving = false;
        this.error = t('common.errors.save');
      },
    });
  }

  protected test(): void {
    if (!this.settings || this.testing) {
      return;
    }
    this.testing = true;
    this.testResult = null;
    this.api.testOidc(this.settings).subscribe({
      next: (result) => {
        this.testResult = result;
        this.testing = false;
      },
      error: () => {
        this.testResult = {
          success: false,
          message: t('adminOidc.errors.test'),
          issuer: null,
          authorizationEndpoint: null,
        };
        this.testing = false;
      },
    });
  }
}
