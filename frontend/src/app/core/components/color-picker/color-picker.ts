import { Component, ElementRef, HostListener, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideBan, LucideCheck, LucideChevronDown } from '@lucide/angular';

import { Hsv, hexToHsv, hsvToHex, normalizeHex, readableTextColor } from './color-utils';

/** Palette shown above the custom picker; same tones as the areas. */
export const PRESET_COLORS = [
  '#b62f2f', '#e11d48', '#db2777', '#c026d3', '#7c3aed', '#4f46e5',
  '#2563eb', '#0284c7', '#0891b2', '#0f766e', '#15803d', '#65a30d',
  '#ca8a04', '#d97706', '#ea580c', '#78716c', '#475569', '#1f2937',
];

type DragTarget = 'area' | 'hue';

/**
 * Color picker used like an input: `<app-color-picker [(ngModel)]="tag.color" />`.
 * The value is a lower case "#rrggbb" string, or null when `allowEmpty` is set and no color is chosen.
 */
@Component({
  selector: 'app-color-picker',
  imports: [LucideBan, LucideCheck, LucideChevronDown],
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ColorPicker), multi: true }],
})
export class ColorPicker implements ControlValueAccessor {
  @Input() allowEmpty = true;
  /** Only the swatch, without the hex text (for tight rows). */
  @Input() compact = false;
  @Input() label = 'Farbe';

  protected readonly presets = PRESET_COLORS;
  protected value: string | null = null;
  protected hsv: Hsv = { h: 0, s: 0, v: 0 };
  protected hexInput = '';
  protected open = false;
  protected disabled = false;

  private dragging: DragTarget | null = null;
  private valueOnOpen: string | null = null;
  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  writeValue(value: string | null): void {
    this.value = normalizeHex(value);
    this.syncFromValue();
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) {
      this.open = false;
    }
  }

  protected get hueColor(): string {
    return hsvToHex({ h: this.hsv.h, s: 1, v: 1 });
  }

  protected get roundedHue(): number {
    return Math.round(this.hsv.h);
  }

  protected get textColor(): string {
    return readableTextColor(this.value);
  }

  protected toggle(): void {
    if (this.disabled) {
      return;
    }
    this.open ? this.close() : this.openPopover();
  }

  protected choose(color: string | null): void {
    this.setValue(color);
    this.syncFromValue();
  }

  protected onHexInput(text: string): void {
    this.hexInput = text;
    const hex = normalizeHex(text);
    if (hex) {
      this.setValue(hex);
      this.hsv = hexToHsv(hex);
    }
  }

  /** Reset an invalid hex text to the current value. */
  protected onHexBlur(): void {
    this.hexInput = this.value ?? '';
  }

  protected startDrag(target: DragTarget, event: PointerEvent): void {
    event.preventDefault();
    this.dragging = target;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.updateFromPointer(event);
  }

  protected onDrag(event: PointerEvent): void {
    if (this.dragging) {
      this.updateFromPointer(event);
    }
  }

  protected endDrag(): void {
    this.dragging = null;
  }

  /** Arrow keys move the handles, for keyboard users. */
  protected onAreaKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      this.updateHsv({ s: clamp(this.hsv.s + move[0]), v: clamp(this.hsv.v + move[1]) });
    }
  }

  protected onHueKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 30 : 5;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const h = (this.hsv.h + (event.key === 'ArrowRight' ? step : -step) + 360) % 360;
      this.updateHsv({ h });
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointerDown(event: PointerEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('keydown.escape', ['$event'])
  protected onEscape(event: Event): void {
    if (this.open) {
      event.stopPropagation();
      // escape discards what was picked while the popover was open
      this.choose(this.valueOnOpen);
      this.close();
    }
  }

  private openPopover(): void {
    this.valueOnOpen = this.value;
    this.syncFromValue();
    this.open = true;
  }

  private close(): void {
    this.open = false;
    this.dragging = null;
    this.onTouched();
  }

  private updateFromPointer(event: PointerEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    if (this.dragging === 'hue') {
      this.updateHsv({ h: x * 360 });
    } else {
      const y = clamp((event.clientY - rect.top) / rect.height);
      this.updateHsv({ s: x, v: 1 - y });
    }
  }

  private updateHsv(change: Partial<Hsv>): void {
    this.hsv = { ...this.hsv, ...change };
    const hex = hsvToHex(this.hsv);
    this.hexInput = hex;
    this.setValue(hex);
  }

  private setValue(value: string | null): void {
    // without allowEmpty "no color" keeps the current color
    const next = value ?? (this.allowEmpty ? null : this.value);
    if (next === this.value) {
      return;
    }
    this.value = next;
    this.onChange(next);
  }

  private syncFromValue(): void {
    // keep the hue when the color has none (grey), so the area does not jump to red
    const hsv = this.value ? hexToHsv(this.value) : { h: this.hsv.h, s: 0.75, v: 0.7 };
    this.hsv = hsv.s === 0 ? { ...hsv, h: this.hsv.h } : hsv;
    this.hexInput = this.value ?? '';
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
