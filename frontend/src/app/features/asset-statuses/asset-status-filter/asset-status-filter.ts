import { Component, ElementRef, HostListener, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck, LucideChevronDown, LucideX } from '@lucide/angular';

import { t, tn } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DropdownPosition } from '../../../shared/components/dropdown-position.directive';
import { AssetStatusBadge } from '../asset-status-badge/asset-status-badge';
import { AssetStatus, statusName } from '../data-access/asset-status.service';

/**
 * Filter field for the asset list: several statuses at once (e.g. "Defekt" and "In Reparatur").
 * The value is the list of selected status UUIDs; empty = all statuses.
 */
@Component({
  selector: 'app-asset-status-filter',
  imports: [AssetStatusBadge, DropdownPosition, TranslatePipe, LucideCheck, LucideChevronDown, LucideX],
  templateUrl: './asset-status-filter.html',
  styleUrl: './asset-status-filter.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AssetStatusFilter), multi: true },
  ],
})
export class AssetStatusFilter implements ControlValueAccessor {
  @Input() statuses: AssetStatus[] = [];

  protected value: string[] = [];
  protected open = false;
  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  writeValue(value: string[] | null): void {
    this.value = value ?? [];
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  protected get label(): string {
    if (!this.value.length) {
      return t('assetStatus.filter.all');
    }
    if (this.value.length === 1) {
      return statusName(this.statuses.find((status) => status.uuid === this.value[0]));
    }
    return tn('assetStatus.filter.selected', this.value.length);
  }

  protected isSelected(status: AssetStatus): boolean {
    return this.value.includes(status.uuid);
  }

  protected toggle(status: AssetStatus): void {
    this.value = this.isSelected(status)
      ? this.value.filter((uuid) => uuid !== status.uuid)
      : [...this.value, status.uuid];
    this.onChange(this.value);
  }

  protected clear(event?: Event): void {
    event?.stopPropagation();
    this.value = [];
    this.onChange(this.value);
  }

  @HostListener('document:pointerdown', ['$event'])
  protected outside(event: PointerEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('keydown.escape')
  protected close(): void {
    if (this.open) {
      this.open = false;
      this.onTouched();
    }
  }
}
