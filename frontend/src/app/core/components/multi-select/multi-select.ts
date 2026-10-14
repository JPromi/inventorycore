import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideLock, LucidePlus, LucideX } from '@lucide/angular';

import { SelectOption } from '../search-select/search-select';

@Component({
  selector: 'app-multi-select',
  imports: [LucideLock, LucidePlus, LucideX],
  templateUrl: './multi-select.html',
  styleUrl: './multi-select.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MultiSelect), multi: true }],
})
export class MultiSelect implements ControlValueAccessor {
  @Input() options: SelectOption[] = [];
  /** Options that are always selected and cannot be removed (e.g. tags inherited from the type). */
  @Input() lockedOptions: SelectOption[] = [];
  @Input() lockedHint = '';
  @Input() placeholder = 'Hinzufügen...';
  @Input() emptyText = 'Keine weiteren Einträge';
  /** Shows a "create" entry for unknown input. The parent handles creation via (create). */
  @Input() allowCreate = false;
  @Output() readonly create = new EventEmitter<string>();

  @ViewChild('input') private input?: ElementRef<HTMLInputElement>;

  protected value: string[] = [];
  protected open = false;
  protected query = '';
  protected activeIndex = 0;
  protected disabled = false;

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  protected get selectedOptions(): SelectOption[] {
    return this.value
      .map((value) => this.options.find((option) => option.value === value))
      .filter((option): option is SelectOption => !!option);
  }

  protected get available(): SelectOption[] {
    const used = new Set([...this.value, ...this.lockedOptions.map((option) => option.value)]);
    const terms = this.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.options
      .filter((option) => !used.has(option.value))
      .filter((option) => {
        const text = `${option.label} ${option.hint ?? ''}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      });
  }

  protected get canCreate(): boolean {
    const name = this.query.trim().toLowerCase();
    return this.allowCreate && !!name && !this.options.some((option) => option.label.toLowerCase() === name);
  }

  /** Number of entries in the dropdown (create entry counts as the last one). */
  protected get entryCount(): number {
    return this.available.length + (this.canCreate ? 1 : 0);
  }

  writeValue(value: string[] | null): void {
    this.value = [...(value ?? [])];
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  protected focusInput(): void {
    this.input?.nativeElement.focus();
  }

  protected onFocus(): void {
    if (!this.disabled) {
      this.open = true;
      this.activeIndex = 0;
    }
  }

  protected onQueryChange(query: string): void {
    // comma separated input selects/creates every finished part
    if (query.includes(',')) {
      const parts = query.split(',');
      this.query = parts.pop() ?? '';
      parts.forEach((part) => this.commitName(part));
      if (this.input) {
        this.input.nativeElement.value = this.query;
      }
    } else {
      this.query = query;
    }
    this.open = true;
    this.activeIndex = 0;
  }

  protected add(option: SelectOption): void {
    if (this.value.includes(option.value)) {
      return;
    }
    this.value = [...this.value, option.value];
    this.onChange(this.value);
    this.resetQuery();
  }

  protected remove(value: string, event?: Event): void {
    event?.stopPropagation();
    this.value = this.value.filter((entry) => entry !== value);
    this.onChange(this.value);
  }

  protected requestCreate(): void {
    this.commitName(this.query);
    this.resetQuery();
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open = true;
        this.activeIndex = Math.min(this.entryCount - 1, this.activeIndex + 1);
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex = Math.max(0, this.activeIndex - 1);
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const option = this.available[this.activeIndex];
        if (option && (this.query.trim() || this.open)) {
          this.add(option);
        } else if (this.canCreate) {
          this.requestCreate();
        }
        break;
      }
      case 'Backspace':
        if (!this.query && this.value.length) {
          this.remove(this.value[this.value.length - 1]);
        }
        break;
      case 'Escape':
        this.open = false;
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  @HostListener('document:mousedown', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private commitName(value: string): void {
    const name = value.trim();
    if (!name) {
      return;
    }
    const existing = this.options.find((option) => option.label.toLowerCase() === name.toLowerCase());
    if (existing) {
      this.add(existing);
    } else if (this.allowCreate) {
      this.create.emit(name);
    }
  }

  private resetQuery(): void {
    this.query = '';
    this.activeIndex = 0;
    if (this.input) {
      this.input.nativeElement.value = '';
    }
  }

  private close(): void {
    this.open = false;
    this.resetQuery();
    this.onTouched();
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => {
      this.host.nativeElement.querySelector('.option.active')?.scrollIntoView({ block: 'nearest' });
    });
  }
}
