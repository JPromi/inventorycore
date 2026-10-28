import { Component, EventEmitter, Input, Output } from '@angular/core';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LabelSheet, sheetFits, sheetSlot } from '../label.model';

/**
 * Scaled drawing of a label sheet: paper, grid and which positions are skipped or printed.
 * With `selectable` a click on a position makes it the first one to print.
 */
@Component({
  selector: 'app-label-sheet-preview',
  imports: [TranslatePipe],
  templateUrl: './label-sheet-preview.html',
  styleUrl: './label-sheet-preview.scss',
})
export class LabelSheetPreview {
  @Input({ required: true }) sheet!: LabelSheet;
  @Input({ required: true }) widthMm = 62;
  @Input({ required: true }) heightMm = 29;
  /** Positions at the start that are already used and stay empty. */
  @Input() skip = 0;
  /** Labels to print; null = only show the grid. */
  @Input() count: number | null = null;
  @Input() selectable = false;
  @Output() readonly skipChange = new EventEmitter<number>();

  protected get fits(): boolean {
    return sheetFits(this.sheet, this.widthMm, this.heightMm);
  }

  protected get positions(): {
    left: number;
    top: number;
    state: 'skipped' | 'printed' | 'free';
  }[] {
    const total = Math.max(1, this.sheet.columns * this.sheet.rows);
    return Array.from({ length: Math.min(total, 5000) }, (_, position) => {
      const slot = sheetSlot(this.sheet, this.widthMm, this.heightMm, position);
      const printed =
        this.count !== null && position >= this.skip && position < this.skip + this.count;
      return {
        left: (slot.x / this.sheet.paperWidthMm) * 100,
        top: (slot.y / this.sheet.paperHeightMm) * 100,
        state: position < this.skip ? 'skipped' : printed ? 'printed' : 'free',
      };
    });
  }

  protected get slotWidth(): number {
    return (this.widthMm / this.sheet.paperWidthMm) * 100;
  }

  protected get slotHeight(): number {
    return (this.heightMm / this.sheet.paperHeightMm) * 100;
  }

  protected pick(position: number): void {
    if (this.selectable) {
      this.skipChange.emit(position);
    }
  }
}
