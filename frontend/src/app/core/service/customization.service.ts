import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, Inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ThemeMode, ThemeService } from './theme.service';

export interface Customization {
  brandName: string | null;
  brandColor: string | null;
  loginTitle: string | null;
  loginMessage: string | null;
  imprintUrl: string | null;
  privacyUrl: string | null;
  websiteUrl: string | null;
  supportUrl: string | null;
  logoUrl: string | null;
  darkBrandColor: string | null;
  darkLogoUrl: string | null;
  advancedThemeEnabled: boolean;
}

/** Read by the inline script of the start screen in index.html; keep both in line. */
const SPLASH_STORAGE_KEY = 'inventorycore.splash';

const DEFAULTS: Customization = {
  brandName: null,
  brandColor: null,
  loginTitle: null,
  loginMessage: null,
  imprintUrl: null,
  privacyUrl: null,
  websiteUrl: null,
  supportUrl: null,
  logoUrl: null,
  darkBrandColor: null,
  darkLogoUrl: null,
  advancedThemeEnabled: false,
};

@Injectable({ providedIn: 'root' })
export class CustomizationService {
  settings: Customization = { ...DEFAULTS };
  private readonly url = `${environment.apiUrl}/admin/customization`;
  private readonly options = { withCredentials: true };

  constructor(
    private readonly http: HttpClient,
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly theme: ThemeService,
    destroyRef: DestroyRef,
  ) {
    theme.effective$.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.applyBrand());
  }

  get brandName(): string {
    return this.settings.brandName || 'InventoryCore';
  }
  get labelColor(): string {
    return (
      this.settings.brandColor ||
      getComputedStyle(this.document.body).getPropertyValue('--theme-light-brand-default').trim()
    );
  }

  get logoUrl(): string | null {
    return this.theme.effective === 'dark' && this.settings.advancedThemeEnabled
      ? this.settings.darkLogoUrl || this.settings.logoUrl
      : this.settings.logoUrl;
  }

  load(fallback = true) {
    return this.http.get<Customization>(`${environment.apiUrl}/customization`, this.options).pipe(
      catchError((error) => (fallback ? of({ ...DEFAULTS }) : throwError(() => error))),
      tap((value) => this.apply(value)),
    );
  }

  save(value: Customization) {
    return this.http
      .put<Customization>(this.url, value, this.options)
      .pipe(tap((settings) => this.apply(settings)));
  }

  uploadLogo(file: File, mode: ThemeMode = 'light') {
    const data = new FormData();
    data.append('file', file);
    return this.http
      .post<Customization>(
        `${this.url}/logo${mode === 'dark' ? '?mode=dark' : ''}`,
        data,
        this.options,
      )
      .pipe(tap((settings) => this.apply(settings)));
  }

  removeLogo(mode: ThemeMode = 'light') {
    return this.http
      .delete<Customization>(`${this.url}/logo${mode === 'dark' ? '?mode=dark' : ''}`, this.options)
      .pipe(tap((settings) => this.apply(settings)));
  }

  get labelContext(): Record<string, string> {
    return {
      brandName: this.brandName,
      brandColor: this.labelColor,
      loginTitle: this.settings.loginTitle || '',
      loginMessage: this.settings.loginMessage || '',
      website: this.settings.websiteUrl || '',
      imprint: this.settings.imprintUrl || '',
      privacy: this.settings.privacyUrl || '',
      support: this.settings.supportUrl || '',
    };
  }

  private apply(value: Customization): void {
    this.settings = { ...DEFAULTS, ...value };
    this.applyBrand();
    this.document.title = this.brandName;
    this.rememberForSplash();
  }

  /**
   * The start screen in index.html is shown before Angular and the API; it reads this copy of the
   * branding so the next start already shows the configured name, color and logo.
   */
  private rememberForSplash(): void {
    const advanced = this.settings.advancedThemeEnabled;
    try {
      this.document.defaultView?.localStorage.setItem(
        SPLASH_STORAGE_KEY,
        JSON.stringify({
          name: this.settings.brandName || null,
          color: this.settings.brandColor || null,
          darkColor: (advanced && this.settings.darkBrandColor) || null,
          logo: this.settings.logoUrl || null,
          darkLogo: (advanced && this.settings.darkLogoUrl) || null,
        }),
      );
    } catch {
      // without browser storage the start screen shows the default branding
    }
  }

  private applyBrand(): void {
    const style = this.document.body.style;
    const configuredColor =
      this.theme.effective === 'dark' && this.settings.advancedThemeEnabled
        ? this.settings.darkBrandColor || this.settings.brandColor
        : this.settings.brandColor;
    const color =
      configuredColor ||
      getComputedStyle(this.document.body).getPropertyValue('--default-brand-color').trim();
    if (color && /^#[0-9a-f]{6}$/i.test(color)) {
      if (configuredColor) {
        style.setProperty('--brand-color', color);
      } else {
        style.removeProperty('--brand-color');
      }
      style.setProperty('--brand-on-color', this.textColor(color));
      const hoverStrength =
        parseFloat(
          getComputedStyle(this.document.body).getPropertyValue('--brand-hover-strength'),
        ) / 100;
      style.setProperty('--brand-on-hover-color', this.textColor(color, hoverStrength));
    } else {
      style.removeProperty('--brand-color');
      style.removeProperty('--brand-on-color');
      style.removeProperty('--brand-on-hover-color');
    }
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        getComputedStyle(this.document.body).getPropertyValue('--background').trim(),
      );
  }

  private textColor(color: string, strength = 1): string {
    const [r, g, b] = [1, 3, 5].map((index) => {
      const channel = (parseInt(color.slice(index, index + 2), 16) / 255) * strength;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const whiteContrast = 1.05 / (luminance + 0.05);
    const blackContrast = (luminance + 0.05) / 0.05;
    return blackContrast > whiteContrast ? 'var(--black)' : 'var(--white)';
  }
}
