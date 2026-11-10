import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LucideTags, LucideSave, LucidePlus, LucideRefreshCw } from '@lucide/angular';
import { environment } from '../../../../../environments/environment';
import { t } from '../../../../core/i18n/i18n';
import { SearchSelect, SelectOption } from '../../../../shared/components/search-select/search-select';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface InventoryIdSettings { pattern: string; }
interface RegenerationResult { count: number; }
@Component({
  selector: 'app-inventory-id-settings-page',
  imports: [FormsModule, TranslatePipe, SearchSelect, LucideTags, LucideSave, LucidePlus, LucideRefreshCw],
  templateUrl: './inventory-id-settings-page.html',
  styleUrl: './inventory-id-settings-page.scss',
})
export class InventoryIdSettingsPage implements OnInit {
  protected pattern = '';
  protected savedPattern: string | null = null;
  protected busy = false;
  protected saving = false;
  protected error = '';
  protected message = '';
  protected length = 10;
  protected readonly randomTokens = ['random_number', 'random_letters', 'random_alphanumeric'];
  protected readonly dateTokens = ['year', 'year_short', 'date', 'month', 'day'];
  protected readonly presets = ['INV-{random_alphanumeric:10}', '{random_number:12}', 'FW-{year}-{random_letters:8}'];
  protected readonly presetOptions: SelectOption[] = [
    { value: this.presets[0], label: t('inventoryIds.editor.presets.0') },
    { value: this.presets[1], label: t('inventoryIds.editor.presets.1') },
    { value: this.presets[2], label: t('inventoryIds.editor.presets.2') },
  ];
  private readonly previewDate = new Date();

  /** Stable examples let users compare edits without random values changing on each keystroke. */
  protected sample(token: string, length = Number(this.length)): string {
    const year = String(this.previewDate.getFullYear());
    const month = String(this.previewDate.getMonth() + 1).padStart(2, '0');
    const day = String(this.previewDate.getDate()).padStart(2, '0');
    const dates: Record<string, string> = { year, year_short: year.slice(-2), date: year + month + day, month, day };
    if (dates[token]) return dates[token];
    if (!Number.isInteger(length) || length < 1 || length > 100) return '';
    const alphabet = token === 'random_number' ? '4827051936' : token === 'random_letters' ? 'KMRZABCDXY' : 'A7K3M9X2B4';
    return alphabet.repeat(Math.ceil(length / alphabet.length)).slice(0, length);
  }

  protected get preview(): string | null {
    if (!this.pattern.trim() || this.pattern.length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(this.pattern)) return null;
    let hasRandom = false;
    let valid = true;
    const value = this.pattern.replace(/\{(random_number|random_letters|random_alphanumeric)(?::([0-9]{1,3}))?}|\{(year|year_short|date|month|day)}/g,
      (_match, randomToken: string | undefined, size: string | undefined, dateToken: string | undefined) => {
        if (randomToken) {
          hasRandom = true;
          const length = size === undefined ? 10 : Number(size);
          if (length < 1 || length > 100) valid = false;
          return this.sample(randomToken, length);
        }
        return this.sample(dateToken!);
      });
    return valid && hasRandom && !/[{}]/.test(value) && value.length <= 255 ? value : null;
  }

  protected usePreset(value: string): void {
    if (!this.presets.includes(value)) return;
    this.pattern = value;
    this.message = ''; this.error = '';
  }
  private readonly url = `${environment.apiUrl}/admin/inventory-id-settings`;
  private readonly options = { withCredentials: true };
  constructor(private readonly http: HttpClient, private readonly confirm: ConfirmDialogService) {}
  ngOnInit(): void {
    this.busy = true;
    this.http.get<InventoryIdSettings>(this.url, this.options).subscribe({
      next: value => { this.pattern = value.pattern; this.savedPattern = value.pattern; this.busy = false; },
      error: () => { this.error = t('inventoryIds.loadError'); this.busy = false; },
    });
  }
  protected insert(input: HTMLInputElement, token: string): void {
    const size = Number(this.length);
    if (token.startsWith('random_') && (!Number.isInteger(size) || size < 1 || size > 100)) {
      this.error = t('inventoryIds.lengthError'); return;
    }
    const value = '{' + token + (token.startsWith('random_') ? ':' + size : '') + '}';
    const start = input.selectionStart ?? this.pattern.length;
    const end = input.selectionEnd ?? start;
    this.pattern = this.pattern.slice(0, start) + value + this.pattern.slice(end);
    input.value = this.pattern;
    input.focus();
    input.setSelectionRange(start + value.length, start + value.length);
    this.message = ''; this.error = '';
  }
  protected save(): void {
    if (this.busy || this.savedPattern === null || this.preview === null) return;
    this.busy = true; this.saving = true; this.error = ''; this.message = '';
    this.http.put<InventoryIdSettings>(this.url, { pattern: this.pattern }, this.options).subscribe({
      next: value => { this.savedPattern = value.pattern; this.pattern = value.pattern; this.busy = false; this.saving = false; this.message = t('inventoryIds.saved'); },
      error: error => { this.busy = false; this.saving = false; this.error = error?.error?.message || t('common.errors.save'); },
    });
  }
  protected async regenerate(): Promise<void> {
    if (this.busy || this.savedPattern === null || this.pattern !== this.savedPattern) return;
    const pattern = this.savedPattern;
    this.busy = true;
    const confirmed = await this.confirm.confirm({
      title: t('inventoryIds.warningTitle'), message: t('inventoryIds.warning', { pattern }),
      confirmLabel: t('inventoryIds.regenerate'), danger: true,
    });
    if (!confirmed) { this.busy = false; return; }
    this.error = ''; this.message = '';
    this.http.post<RegenerationResult>(`${this.url}/regenerate`, { pattern, confirmed: true }, this.options).subscribe({
      next: result => { this.busy = false; this.message = t('inventoryIds.regenerated', { count: result.count }); },
      error: error => { this.busy = false; this.error = error?.error?.message || t('inventoryIds.regenerateError'); },
    });
  }
}
