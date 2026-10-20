import { NgZone } from '@angular/core';

interface TouchItem {
  uuid: string;
}
interface Gesture {
  identifier: number;
  anchor: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  selecting: boolean;
  snapshot: Set<string>;
  container: HTMLElement;
  active: boolean;
  lastItem: string | null;
  lastFrame: number;
  edge: number;
}

/** One gesture coordinator per list, including lists split across multiple groups. */
export class TouchSelection<T extends TouchItem> {
  private readonly rows = new Map<HTMLElement, () => T>();
  private gesture?: Gesture;
  private timer?: ReturnType<typeof setTimeout>;
  private frame?: number;
  private released?: { at: number; x: number; y: number; startX: number; startY: number };

  constructor(
    private readonly document: Document,
    private readonly zone: NgZone,
    private readonly items: () => T[],
    private readonly enabled: () => boolean,
    private readonly selected: Set<string>,
  ) {}

  register(element: HTMLElement, item: () => T): void {
    this.rows.set(element, item);
  }
  unregister(element: HTMLElement): void {
    const item = this.rows.get(element)?.();
    if (this.gesture?.anchor === item?.uuid) this.cancel();
    this.rows.delete(element);
  }

  start(item: T, event: TouchEvent, row: HTMLElement): void {
    this.cancel();
    this.released = undefined;
    if (!this.enabled() || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const container = this.scrollContainer(row);
    this.gesture = {
      identifier: touch.identifier,
      anchor: item.uuid,
      x: touch.clientX,
      y: touch.clientY,
      startX: touch.clientX,
      startY: touch.clientY,
      selecting: !this.selected.has(item.uuid),
      snapshot: new Set(this.selected),
      container,
      active: false,
      lastItem: null,
      lastFrame: 0,
      edge: parseFloat(getComputedStyle(container).getPropertyValue('--selection-scroll-edge')),
    };
    this.zone.runOutsideAngular(() => {
      this.document.addEventListener('touchmove', this.move, { passive: false });
      this.document.addEventListener('touchend', this.end, { passive: false });
      this.document.addEventListener('touchcancel', this.cancel);
      this.document.addEventListener('visibilitychange', this.cancel);
      this.timer = setTimeout(() => {
        const gesture = this.gesture;
        if (!gesture || !this.enabled()) return this.cancel();
        gesture.active = true;
        gesture.container.classList.add('touch-selecting');
        this.apply(item.uuid);
        this.frame = requestAnimationFrame(this.tick);
      }, 350);
    });
  }

  suppressClick(event: MouseEvent): boolean {
    const end = this.released;
    return (
      !!end &&
      event.detail !== 0 &&
      Date.now() - end.at < 500 &&
      (Math.hypot(event.clientX - end.x, event.clientY - end.y) < 24 ||
        Math.hypot(event.clientX - end.startX, event.clientY - end.startY) < 24)
    );
  }

  cancel = (): void => {
    clearTimeout(this.timer);
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.gesture?.container.classList.remove('touch-selecting');
    this.gesture = undefined;
    this.frame = undefined;
    this.document.removeEventListener('touchmove', this.move);
    this.document.removeEventListener('touchend', this.end);
    this.document.removeEventListener('touchcancel', this.cancel);
    this.document.removeEventListener('visibilitychange', this.cancel);
  };

  destroy(): void {
    this.cancel();
    this.rows.clear();
  }

  private readonly move = (event: TouchEvent): void => {
    const gesture = this.gesture;
    if (!gesture) return;
    if (!this.enabled() || event.touches.length !== 1) return this.cancel();
    const touch = Array.from(event.touches).find(
      (entry) => entry.identifier === gesture.identifier,
    );
    if (!touch) return this.cancel();
    gesture.x = touch.clientX;
    gesture.y = touch.clientY;
    if (!gesture.active) {
      if (Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > 10) this.cancel();
      return;
    }
    if (event.cancelable) event.preventDefault();
    this.hit();
  };

  private readonly end = (event: TouchEvent): void => {
    const gesture = this.gesture;
    if (
      !gesture ||
      !Array.from(event.changedTouches).some((touch) => touch.identifier === gesture.identifier)
    )
      return;
    if (gesture.active) {
      if (event.cancelable) event.preventDefault();
      this.released = {
        at: Date.now(),
        x: gesture.x,
        y: gesture.y,
        startX: gesture.startX,
        startY: gesture.startY,
      };
    }
    this.cancel();
  };

  private readonly tick = (time: number): void => {
    const gesture = this.gesture;
    if (!gesture?.active || !this.enabled()) return this.cancel();
    const bounds = gesture.container.getBoundingClientRect();
    const top = Math.max(0, bounds.top);
    const bottom = Math.min(window.innerHeight, bounds.bottom);
    const edge = Math.min(gesture.edge, (bottom - top) / 3);
    const proximity =
      gesture.y < top + edge
        ? -Math.min(1, (top + edge - gesture.y) / edge)
        : gesture.y > bottom - edge
          ? Math.min(1, (gesture.y - bottom + edge) / edge)
          : 0;
    const elapsed = gesture.lastFrame ? Math.min(32, time - gesture.lastFrame) : 16;
    gesture.lastFrame = time;
    if (proximity) gesture.container.scrollTop += (proximity * 900 * elapsed) / 1000;
    this.hit();
    this.frame = requestAnimationFrame(this.tick);
  };

  private hit(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const bounds = gesture.container.getBoundingClientRect();
    const y = Math.max(
      Math.max(0, bounds.top) + 1,
      Math.min(gesture.y, Math.min(window.innerHeight, bounds.bottom) - 1),
    );
    for (const hit of this.document.elementsFromPoint(gesture.x, y)) {
      let element: Element | null = hit;
      while (element) {
        const item = this.rows.get(element as HTMLElement)?.();
        if (item) {
          this.apply(item.uuid);
          return;
        }
        element = element.parentElement;
      }
    }
  }

  private apply(uuid: string): void {
    const gesture = this.gesture;
    if (!gesture || gesture.lastItem === uuid) return;
    const items = this.items();
    const from = items.findIndex((item) => item.uuid === gesture.anchor);
    const to = items.findIndex((item) => item.uuid === uuid);
    if (from < 0 || to < 0) return this.cancel();
    gesture.lastItem = uuid;
    this.zone.run(() => {
      this.selected.clear();
      for (const id of gesture.snapshot) this.selected.add(id);
      for (const item of items.slice(Math.min(from, to), Math.max(from, to) + 1)) {
        gesture.selecting ? this.selected.add(item.uuid) : this.selected.delete(item.uuid);
      }
    });
  }

  private scrollContainer(row: HTMLElement): HTMLElement {
    let element = row.parentElement;
    while (element) {
      if (
        /(auto|scroll)/.test(getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight
      )
        return element;
      element = element.parentElement;
    }
    return row.closest<HTMLElement>('.page') || row.parentElement!;
  }
}
