import { Component, ElementRef, HostListener, Input, ViewChild, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck, LucideChevronDown, LucideSearch, LucideX } from '@lucide/angular';
import { DropdownPosition } from '../dropdown-position.directive';
import { t } from '../../i18n/i18n';
import { TranslatePipe } from '../../i18n/translate.pipe';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  color?: string | null;
}

@Component({
  selector: 'app-search-select',
  imports: [DropdownPosition, TranslatePipe, LucideCheck, LucideChevronDown, LucideSearch, LucideX],
  templateUrl: './search-select.html',
  styleUrl: './search-select.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchSelect), multi: true }],
})
export class SearchSelect implements ControlValueAccessor {
  @Input() options: SelectOption[] = [];
  @Input() placeholder = t('common.select');
  @Input() searchPlaceholder = t('common.searchPlaceholder');
  /** When set, the selection can be cleared and this label is shown as the empty option. */
  @Input() clearLabel: string | null = null;
  @Input() emptyText = t('common.noResults');

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  protected value: string | null = null;
  protected open = false;
  protected query = '';
  protected activeIndex = 0;
  protected disabled = false;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  protected get selected(): SelectOption | undefined {
    return this.options.find((option) => option.value === this.value);
  }

  protected get filtered(): SelectOption[] {
    const terms = this.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      return this.options;
    }
    return this.options.filter((option) => {
      const text = `${option.label} ${option.hint ?? ''}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }

  writeValue(value: string | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  protected toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.openPanel();
    }
  }

  protected select(value: string | null): void {
    this.value = value;
    this.onChange(value);
    this.close();
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    this.select(null);
  }

  protected onQueryChange(query: string): void {
    this.query = query;
    this.activeIndex = 0;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.filtered;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex = Math.min(options.length - 1, this.activeIndex + 1);
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex = Math.max(0, this.activeIndex - 1);
        this.scrollActiveIntoView();
        break;
      case 'Enter':
        event.preventDefault();
        if (options[this.activeIndex]) {
          this.select(options[this.activeIndex].value);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (!this.open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.openPanel();
    } else if (this.open && event.key === 'Escape') {
      // the search field is not focused yet: only close the panel, not a surrounding dialog
      event.preventDefault();
      this.close();
    }
  }

  @HostListener('document:mousedown', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private openPanel(): void {
    if (this.disabled) {
      return;
    }
    this.open = true;
    this.query = '';
    const index = this.options.findIndex((option) => option.value === this.value);
    this.activeIndex = Math.max(0, index);
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
      this.scrollActiveIntoView();
    });
  }

  private close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.onTouched();
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => {
      this.host.nativeElement.querySelector('.option.active')?.scrollIntoView({ block: 'nearest' });
    });
  }
}
