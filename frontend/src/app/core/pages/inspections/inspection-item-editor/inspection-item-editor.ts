import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCamera, LucideImagePlus, LucideX } from '@lucide/angular';

import {
  InspectionField,
  InspectionItem,
  InspectionPhoto,
  InspectionPhotoTarget,
  fieldOptions,
} from '../../../service/inspection.service';

export interface FieldValueChange {
  field: InspectionField;
  value: string;
  /** Text input: save after a short pause. */
  debounce: boolean;
}

export interface PhotoFile {
  file: File;
  target: InspectionPhotoTarget;
}

/**
 * Check fields, note and photos of one asset in an inspection. Used in the item list and in the
 * popup over the full-screen camera; saving is done by the inspection page.
 */
@Component({
  selector: 'app-inspection-item-editor',
  imports: [FormsModule, LucideCamera, LucideImagePlus, LucideX],
  templateUrl: './inspection-item-editor.html',
  styleUrl: './inspection-item-editor.scss',
})
export class InspectionItemEditor {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  @Input({ required: true }) item!: InspectionItem;
  @Input() fields: InspectionField[] = [];
  /** Photo buttons ask for the live camera (`photoRequest`) instead of opening the file picker. */
  @Input() liveCamera = false;
  /** "Lädt hoch...", "Beim Asset gespeichert" and errors of the last photo. */
  @Input() photoStatus: string | null | undefined = null;

  @Output() readonly valueChange = new EventEmitter<FieldValueChange>();
  @Output() readonly noteChange = new EventEmitter<string>();
  @Output() readonly photoFile = new EventEmitter<PhotoFile>();
  @Output() readonly photoRequest = new EventEmitter<InspectionPhotoTarget>();
  @Output() readonly photoRemove = new EventEmitter<InspectionPhoto>();

  protected readonly options = fieldOptions;
  private pendingTarget: InspectionPhotoTarget = 'INSPECTION';

  protected value(field: InspectionField): string {
    return this.item.values.find((entry) => entry.fieldUuid === field.uuid)?.value ?? '';
  }

  protected set(field: InspectionField, value: string, debounce = false): void {
    this.valueChange.emit({ field, value, debounce });
  }

  /** Yes / no: clicking the active answer again clears it. */
  protected toggle(field: InspectionField, answer: 'true' | 'false'): void {
    this.set(field, this.value(field) === answer ? '' : answer);
  }

  protected takePhoto(target: InspectionPhotoTarget): void {
    if (this.liveCamera) {
      this.photoRequest.emit(target);
      return;
    }
    this.pendingTarget = target;
    this.fileInput?.nativeElement.click();
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.photoFile.emit({ file, target: this.pendingTarget });
    }
    // the same file can be chosen again
    input.value = '';
  }
}
