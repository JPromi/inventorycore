import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideMaximize,
  LucideRotateCw,
  LucideX,
  LucideZoomIn,
  LucideZoomOut,
} from '@lucide/angular';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ImageViewerService, ViewerState } from './image-viewer.service';

@Component({
  selector: 'app-image-viewer',
  imports: [
    TranslatePipe,
    LucideChevronLeft,
    LucideChevronRight,
    LucideMaximize,
    LucideRotateCw,
    LucideX,
    LucideZoomIn,
    LucideZoomOut,
  ],
  templateUrl: './image-viewer.html',
  styleUrl: './image-viewer.scss',
})
export class ImageViewer implements OnInit, OnDestroy {
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('stage') private stage?: ElementRef<HTMLElement>;
  @ViewChild('picture') private picture?: ElementRef<HTMLImageElement>;
  protected state: ViewerState | null = null;
  protected zoom = 1;
  protected x = 0;
  protected y = 0;
  protected loading = true;
  protected failed = false;
  protected readonly round = Math.round;
  private readonly subscriptions = new Subscription();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private swipeX = 0;
  private swipeY = 0;
  private pinched = false;
  private dragged = false;
  private backgroundDown = false;

  constructor(
    protected readonly viewer: ImageViewerService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.viewer.state.subscribe((state) => {
        this.state = state;
        this.reset(true);
        if (state && !this.dialog.nativeElement.open) this.dialog.nativeElement.showModal();
        if (!state && this.dialog.nativeElement.open) this.dialog.nativeElement.close();
      }),
    );
    this.subscriptions.add(
      this.router.events.subscribe((event) => {
        if (event instanceof NavigationStart) this.viewer.close();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.dialog.nativeElement.close();
  }

  protected navigate(direction: number): void {
    if (!this.state) return;
    const index = this.state.index + direction;
    if (index < 0 || index >= this.state.images.length) return;
    this.state = { ...this.state, index };
    this.reset(true);
  }

  protected reset(imageChanged = false): void {
    this.zoom = 1;
    this.x = this.y = 0;
    this.pointers.clear();
    if (imageChanged) {
      this.loading = true;
      this.failed = false;
    }
  }

  protected setZoom(value: number): void {
    this.zoom = Math.max(1, Math.min(6, value));
    this.clamp();
  }

  protected wheel(event: WheelEvent): void {
    event.preventDefault();
    this.setZoom(this.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  }

  @HostListener('document:keydown', ['$event'])
  protected key(event: KeyboardEvent): void {
    if (!this.state) return;
    if (event.key === 'ArrowLeft') this.navigate(-1);
    else if (event.key === 'ArrowRight') this.navigate(1);
    else if (event.key === '+' || event.key === '=') this.setZoom(this.zoom + 0.25);
    else if (event.key === '-') this.setZoom(this.zoom - 0.25);
    else if (event.key === '0') this.reset();
    else return;
    event.preventDefault();
  }

  protected down(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.stage?.nativeElement.setPointerCapture(event.pointerId);
    if (!this.pointers.size) {
      this.backgroundDown = event.target === this.stage?.nativeElement;
      this.swipeX = event.clientX;
      this.swipeY = event.clientY;
      this.pinched = this.dragged = false;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size > 1) this.pinched = true;
  }

  protected move(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const before = [...this.pointers.values()];
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...this.pointers.values()];
    if (after.length === 2) {
      const distance = (points: typeof after) =>
        Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const oldDistance = distance(before);
      if (oldDistance > 0) this.setZoom((this.zoom * distance(after)) / oldDistance);
    } else if (this.zoom > 1) {
      this.x += event.clientX - previous.x;
      this.y += event.clientY - previous.y;
      this.clamp();
    }
    if (Math.hypot(event.clientX - this.swipeX, event.clientY - this.swipeY) > 8)
      this.dragged = true;
  }

  protected up(event: PointerEvent, cancelled = false): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    if (
      !cancelled &&
      !this.pointers.size &&
      !this.pinched &&
      this.zoom === 1 &&
      event.pointerType !== 'mouse'
    ) {
      const dx = event.clientX - this.swipeX;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(event.clientY - this.swipeY) * 1.5)
        this.navigate(dx < 0 ? 1 : -1);
    }
  }

  protected background(event: MouseEvent): void {
    if (this.backgroundDown && !this.dragged && event.target === this.stage?.nativeElement)
      this.viewer.close();
  }

  private clamp(): void {
    const stage = this.stage?.nativeElement;
    const image = this.picture?.nativeElement;
    const maxX =
      stage && image ? Math.max(0, (image.clientWidth * this.zoom - stage.clientWidth) / 2) : 0;
    const maxY =
      stage && image ? Math.max(0, (image.clientHeight * this.zoom - stage.clientHeight) / 2) : 0;
    this.x = Math.max(-maxX, Math.min(maxX, this.x));
    this.y = Math.max(-maxY, Math.min(maxY, this.y));
  }
}
