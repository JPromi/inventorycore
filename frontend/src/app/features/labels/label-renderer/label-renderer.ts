import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { renderBarcode } from '../barcode';
import { LabelContext, LabelElement, resolveContent } from '../label.model';
import { CustomizationService } from '../../../core/service/customization.service';

type DragMode = 'move' | 'resize';

interface DragState {
  element: LabelElement;
  mode: DragMode;
  startX: number;
  startY: number;
  origin: { x: number; y: number; width: number; height: number };
  pxPerMm: number;
}

/**
 * Draws a label in real millimeters. Only inline styles are used for the label itself,
 * so its HTML can be copied into a print window and looks exactly the same.
 */
@Component({
  selector: 'app-label-renderer',
  imports: [TranslatePipe],
  templateUrl: './label-renderer.html',
  styleUrl: './label-renderer.scss',
})
export class LabelRenderer {
  @Input({ required: true }) widthMm = 62;
  @Input({ required: true }) heightMm = 29;
  @Input() elements: LabelElement[] = [];
  @Input() context: LabelContext = {};
  /** Editor mode: elements can be selected, moved and resized. */
  @Input() editable = false;
  @Input() selectedId: string | null = null;
  @Input() snapMm = 0.5;
  /** Margin along the edges that elements cannot be moved or resized into. */
  @Input() safeAreaMm = 0;
  @Output() readonly selectedIdChange = new EventEmitter<string | null>();
  @Output() readonly changed = new EventEmitter<void>();

  @ViewChild('root', { static: true }) private root!: ElementRef<HTMLElement>;

  private readonly barcodes = new Map<string, { svg: SafeHtml | null; error: string | null }>();
  private readonly pending = new Set<string>();
  private drag: DragState | null = null;

  constructor(
    private readonly sanitizer: DomSanitizer,
    protected readonly customization: CustomizationService,
  ) {}

  /** The rendered label element (used for printing). */
  get nativeLabel(): HTMLElement {
    return this.root.nativeElement;
  }

  protected text(element: LabelElement): string {
    return resolveContent(element.content, { ...this.customization.labelContext, ...this.context });
  }

  protected barcode(element: LabelElement): { svg: SafeHtml | null; error: string | null } | null {
    const text = this.text(element);
    const symbology = element.symbology ?? 'qrcode';
    const key = `${symbology}|${!!element.showText}|${text}`;
    const result = this.barcodes.get(key);
    if (result) {
      return result;
    }
    if (!this.pending.has(key)) {
      this.pending.add(key);
      renderBarcode(symbology, text, !!element.showText).then(({ svg, error }) => {
        this.pending.delete(key);
        this.barcodes.set(key, {
          svg: svg ? this.sanitizer.bypassSecurityTrustHtml(svg) : null,
          error,
        });
      });
    }
    return null;
  }

  protected justify(element: LabelElement): string {
    return { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[
      element.verticalAlign ?? 'top'
    ];
  }

  protected onBackgroundPointerDown(event: PointerEvent): void {
    if (this.editable && event.target === this.root.nativeElement) {
      this.select(null);
    }
  }

  protected startDrag(event: PointerEvent, element: LabelElement, mode: DragMode): void {
    if (!this.editable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.select(element.id);
    this.drag = {
      element,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: element.x, y: element.y, width: element.width, height: element.height },
      pxPerMm: this.root.nativeElement.getBoundingClientRect().width / this.widthMm,
    };
  }

  @HostListener('document:pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (!this.drag) {
      return;
    }
    const { element, origin, mode, pxPerMm } = this.drag;
    const dx = (event.clientX - this.drag.startX) / pxPerMm;
    const dy = (event.clientY - this.drag.startY) / pxPerMm;
    const right = this.widthMm - this.safeAreaMm;
    const bottom = this.heightMm - this.safeAreaMm;
    if (mode === 'move') {
      element.x = this.clamp(this.snap(origin.x + dx), this.safeAreaMm, right - element.width);
      element.y = this.clamp(this.snap(origin.y + dy), this.safeAreaMm, bottom - element.height);
    } else {
      element.width = this.clamp(this.snap(origin.width + dx), 1, right - element.x);
      element.height = this.clamp(this.snap(origin.height + dy), 1, bottom - element.y);
    }
  }

  @HostListener('document:pointerup')
  protected onPointerUp(): void {
    if (this.drag) {
      this.drag = null;
      this.changed.emit();
    }
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.selectedIdChange.emit(id);
  }

  private snap(value: number): number {
    return this.snapMm > 0 ? Math.round(value / this.snapMm) * this.snapMm : value;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }
}
