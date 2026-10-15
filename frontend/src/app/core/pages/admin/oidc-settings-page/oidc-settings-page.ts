import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCircleCheck, LucideCircleX, LucideCopy, LucideKeyRound, LucidePlugZap, LucideSave } from '@lucide/angular';

import { AdminApiService, OidcSettings, OidcTestResult } from '../../../service/admin-api.service';

@Component({
  selector: 'app-oidc-settings-page',
  imports: [FormsModule, LucideCircleCheck, LucideCircleX, LucideCopy, LucideKeyRound, LucidePlugZap, LucideSave],
  templateUrl: './oidc-settings-page.html',
  styleUrl: './oidc-settings-page.scss',
})
export class OidcSettingsPage implements OnInit {
  protected settings: OidcSettings | null = null;
  protected loading = false;
  protected saving = false;
  protected testing = false;
  protected saved = false;
  protected copied = false;
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
        this.error = 'Einstellungen konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  /** Redirect URI as the browser sees it (the backend only knows "{baseUrl}" without public URL). */
  protected get redirectUri(): string {
    const base = this.settings?.publicUrl?.trim().replace(/\/+$/, '') || window.location.origin;
    return `${base}/login/oauth2/code/oidc`;
  }

  protected changed(): void {
    this.saved = false;
  }

  protected async copyRedirectUri(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.redirectUri);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
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
        this.error = 'Speichern fehlgeschlagen.';
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
        this.testResult = { success: false, message: 'Test konnte nicht ausgeführt werden.', issuer: null, authorizationEndpoint: null };
        this.testing = false;
      },
    });
  }
}
