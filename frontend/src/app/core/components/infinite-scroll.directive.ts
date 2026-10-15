import { Directive, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output } from '@angular/core';

/**
 * Put on an element after a list: emits `appInfiniteScroll` when it comes near the visible area
 * of its scroll container, so the next page can be loaded. While `scrollDisabled` is true
 * (loading, nothing more) nothing is emitted; when it turns false the element is checked again,
 * so a short page that does not fill the screen loads the next one right away.
 */
@Directive({ selector: '[appInfiniteScroll]' })
export class InfiniteScroll implements OnInit, OnChanges, OnDestroy {
  @Input() scrollDisabled = false;
  @Output() readonly appInfiniteScroll = new EventEmitter<void>();

  private observer?: IntersectionObserver;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly zone: NgZone) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      // starts loading a bit before the end becomes visible
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !this.scrollDisabled) {
          this.zone.run(() => this.appInfiniteScroll.emit());
        }
      }, { rootMargin: '0px 0px 400px 0px' });
      this.observer.observe(this.element.nativeElement);
    });
  }

  ngOnChanges(): void {
    if (this.observer && !this.scrollDisabled) {
      // observing again reports the current state once more
      this.observer.unobserve(this.element.nativeElement);
      this.observer.observe(this.element.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
