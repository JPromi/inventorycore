import { Component, ElementRef, HostListener, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCalendarDays, LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DropdownPosition } from '../dropdown-position.directive';

@Component({
  selector: 'app-date-select',
  imports: [DropdownPosition, TranslatePipe, LucideCalendarDays, LucideChevronLeft, LucideChevronRight],
  templateUrl: './date-select.html',
  styleUrl: './date-select.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateSelect), multi: true }],
})
export class DateSelect implements ControlValueAccessor {
  @Input() ariaLabel = '';
  protected value = '';
  protected open = false;
  protected disabled = false;
  protected month = new Date().getMonth();
  protected year = new Date().getFullYear();
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  writeValue(value: string | null): void { this.value = value ?? ''; }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; if (disabled) this.open = false; }

  protected get label(): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
  }
  protected get monthLabel(): string {
    return new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' }).format(new Date(this.year, this.month, 1));
  }
  protected get days(): (number | null)[] {
    const first = (new Date(this.year, this.month, 1).getDay() + 6) % 7;
    const count = new Date(this.year, this.month + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }
  protected toggle(): void {
    if (this.open) { this.close(); return; }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value);
    const date = new Date();
    this.year = match ? Number(match[1]) : date.getFullYear();
    this.month = match ? Number(match[2]) - 1 : date.getMonth();
    this.open = true;
  }
  protected changeMonth(offset: number): void {
    const date = new Date(this.year, this.month + offset, 1);
    this.year = date.getFullYear();
    this.month = date.getMonth();
  }
  protected dateValue(day: number): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  protected select(day: number): void {
    this.value = this.dateValue(day);
    this.onChange(this.value);
    this.close();
  }
  protected close(): void { this.open = false; this.onTouched(); }
  @HostListener('document:pointerdown', ['$event'])
  protected outside(event: PointerEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
  @HostListener('document:keydown.escape')
  protected escape(): void { if (this.open) this.close(); }
}
