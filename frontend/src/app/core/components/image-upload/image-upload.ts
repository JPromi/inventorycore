import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { ImageViewerService } from '../image-viewer/image-viewer.service';
import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideCircleAlert,
  LucideImageUp,
  LucideStar,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { Subscription } from 'rxjs';

import { t } from '../../i18n/i18n';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { ACCEPTED_IMAGE_TYPES, FileApiService, MAX_UPLOAD_BYTES } from '../../service/file-api.service';
import { InventoryImage } from '../../service/inventory-api.service';

interface PendingUpload {
  id: number;
  name: string;
  progress: number;
  error?: string;
  subscription?: Subscription;
}

/**
 * Image list with drag & drop upload. Files are uploaded right away and the list only keeps
 * their file ids; the first image becomes the cover (THUMBNAIL) unless one is chosen.
 */
@Component({
  selector: 'app-image-upload',
  imports: [TranslatePipe, LucideChevronLeft, LucideChevronRight, LucideCircleAlert, LucideImageUp, LucideStar, LucideTrash2, LucideX],
  templateUrl: './image-upload.html',
  styleUrl: './image-upload.scss',
})
export class ImageUpload implements OnDestroy {
  @Input() images: InventoryImage[] = [];
  @Output() readonly imagesChange = new EventEmitter<InventoryImage[]>();
  /** True while uploads are running, so the form can wait before saving. */
  @Output() readonly busyChange = new EventEmitter<boolean>();
  @Input() disabled = false;

  protected readonly accept = ACCEPTED_IMAGE_TYPES.join(',');
  protected pending: PendingUpload[] = [];
  protected dragging = false;
  private nextId = 0;

  constructor(private readonly files: FileApiService, protected readonly imageViewer: ImageViewerService) {}

  ngOnDestroy(): void {
    this.pending.forEach((upload) => upload.subscription?.unsubscribe());
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.upload(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled) {
      return;
    }
    event.preventDefault();
    this.dragging = true;
  }

  protected onDragLeave(event: DragEvent): void {
    // ignore leaving into a child element of the drop zone
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
      this.dragging = false;
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (!this.disabled) {
      this.upload(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  protected setCover(index: number): void {
    this.emit(this.images.map((image, imageIndex) => ({ ...image, kind: imageIndex === index ? 'THUMBNAIL' : 'GALLERY' })));
  }

  protected move(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.images.length) {
      return;
    }
    const images = [...this.images];
    [images[index], images[target]] = [images[target], images[index]];
    this.emit(images);
  }

  protected remove(index: number): void {
    const removed = this.images[index];
    const images = this.images.filter((_, imageIndex) => imageIndex !== index);
    // keep a cover if the cover was removed
    if (removed?.kind === 'THUMBNAIL' && images.length && !images.some((image) => image.kind === 'THUMBNAIL')) {
      images[0] = { ...images[0], kind: 'THUMBNAIL' };
    }
    this.emit(images);
  }

  protected dismiss(upload: PendingUpload): void {
    upload.subscription?.unsubscribe();
    this.pending = this.pending.filter((entry) => entry !== upload);
    this.updateBusy();
  }

  protected preview(image: InventoryImage): string {
    return image.thumbnailUrl || image.url || '';
  }

  private upload(files: File[]): void {
    for (const file of files) {
      const upload: PendingUpload = { id: this.nextId++, name: file.name, progress: 0 };
      this.pending = [...this.pending, upload];

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        upload.error = t('components.imageUpload.errors.unsupportedType');
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        upload.error = t('components.imageUpload.errors.maxSize', { size: MAX_UPLOAD_BYTES / 1024 / 1024 });
        continue;
      }

      upload.subscription = this.files.uploadImage(file).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            upload.progress = Math.round((event.loaded / event.total) * 100);
          } else if (event.type === HttpEventType.Response && event.body) {
            const stored = event.body;
            const hasCover = this.images.some((image) => image.kind === 'THUMBNAIL');
            this.emit([
              ...this.images,
              {
                kind: hasCover ? 'GALLERY' : 'THUMBNAIL',
                fileUuid: stored.uuid,
                url: stored.url,
                thumbnailUrl: stored.thumbnailUrl,
                fileName: stored.originalName ?? file.name,
                contentType: stored.contentType,
                sortOrder: this.images.length,
              },
            ]);
            this.pending = this.pending.filter((entry) => entry !== upload);
            this.updateBusy();
          }
        },
        error: (error: HttpErrorResponse) => {
          upload.error =
            error.status === 413
              ? t('components.imageUpload.errors.tooLarge')
              : typeof error.error?.message === 'string' && error.error.message
                ? error.error.message
                : t('components.imageUpload.errors.failed');
          upload.subscription = undefined;
          this.updateBusy();
        },
      });
    }
    this.updateBusy();
  }

  private emit(images: InventoryImage[]): void {
    this.images = images.map((image, index) => ({ ...image, sortOrder: index }));
    this.imagesChange.emit(this.images);
  }

  private updateBusy(): void {
    this.busyChange.emit(this.pending.some((upload) => !upload.error));
  }
}
