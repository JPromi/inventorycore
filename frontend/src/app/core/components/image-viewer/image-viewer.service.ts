import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ViewerImage {
  url?: string | null;
  thumbnailUrl?: string | null;
  fileName?: string | null;
  alt?: string;
}

export interface ViewerState { images: ViewerImage[]; index: number; }

@Injectable({ providedIn: 'root' })
export class ImageViewerService {
  readonly state = new BehaviorSubject<ViewerState | null>(null);

  open(images: ViewerImage[], index = 0): void {
    const valid = images.filter(image => image.url || image.thumbnailUrl);
    if (!valid.length) return;
    const selected = valid.indexOf(images[index]);
    this.state.next({ images: [...valid], index: selected >= 0 ? selected : 0 });
  }

  close(): void { this.state.next(null); }
}
