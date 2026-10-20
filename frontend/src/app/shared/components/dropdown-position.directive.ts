import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
} from '@angular/core';
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type Placement,
} from '@floating-ui/dom';

@Directive({ selector: '[appDropdownPosition]', host: { class: 'dropdown-panel' } })
export class DropdownPosition implements AfterViewInit, OnDestroy {
  @Input({ required: true }) appDropdownPosition!: HTMLElement;
  @Input() dropdownPlacement: Placement = 'bottom-start';
  @Output() dropdownReady = new EventEmitter<void>();
  private cleanup?: () => void;
  private destroyed = false;
  private ready = false;

  constructor(
    private readonly element: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    const panel = this.element.nativeElement;
    panel.style.visibility = 'hidden';
    panel.setAttribute('popover', 'manual');
    panel.showPopover();
    const styles = getComputedStyle(panel);
    const gap = parseFloat(styles.getPropertyValue('--dropdown-gap'));
    const padding = parseFloat(styles.getPropertyValue('--dropdown-viewport-padding'));

    this.zone.runOutsideAngular(() => {
      this.cleanup = autoUpdate(this.appDropdownPosition, panel, () => {
        void computePosition(this.appDropdownPosition, panel, {
          strategy: 'fixed',
          placement: this.dropdownPlacement,
          middleware: [
            offset(gap),
            flip({ padding }),
            shift({ padding }),
            size({
              padding,
              apply: ({ availableWidth, availableHeight, rects }) => {
                panel.style.setProperty('--dropdown-reference-width', `${rects.reference.width}px`);
                panel.style.setProperty(
                  '--dropdown-available-width',
                  `${Math.max(0, availableWidth)}px`,
                );
                panel.style.setProperty(
                  '--dropdown-available-height',
                  `${Math.max(0, availableHeight)}px`,
                );
              },
            }),
          ],
        }).then(({ x, y }) => {
          if (!this.destroyed) {
            Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' });
            if (!this.ready) {
              this.ready = true;
              this.dropdownReady.emit();
            }
          }
        });
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup?.();
    if (this.element.nativeElement.matches(':popover-open')) {
      this.element.nativeElement.hidePopover();
    }
  }
}
