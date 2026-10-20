import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { catchError, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

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
}

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
};

@Injectable({ providedIn: 'root' })
export class CustomizationService {
  settings: Customization = { ...DEFAULTS };
  private readonly url = `${environment.apiUrl}/admin/customization`;
  private readonly options = { withCredentials: true };

  constructor(
    private readonly http: HttpClient,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  get brandName(): string {
    return this.settings.brandName || 'InventoryCore';
  }
  get labelColor(): string {
    return (
      this.settings.brandColor ||
      getComputedStyle(this.document.body).getPropertyValue('--accent').trim()
    );
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

  uploadLogo(file: File) {
    const data = new FormData();
    data.append('file', file);
    return this.http
      .post<Customization>(`${this.url}/logo`, data, this.options)
      .pipe(tap((settings) => this.apply(settings)));
  }

  removeLogo() {
    return this.http
      .delete<Customization>(`${this.url}/logo`, this.options)
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
    const style = this.document.body.style;
    const color = this.settings.brandColor;
    if (color && /^#[0-9a-f]{6}$/i.test(color)) {
      style.setProperty('--brand-color', color);
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
    this.document.title = this.brandName;
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
