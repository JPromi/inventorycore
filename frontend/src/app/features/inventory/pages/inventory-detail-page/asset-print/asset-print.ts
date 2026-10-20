import { DatePipe, formatDate } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { inspectionResult } from '../../../../../shared/components/asset-inspection-list/asset-inspection-list';
import {
  PrintDocument,
  PrintMeta,
} from '../../../../../shared/components/print-document/print-document';
import {
  SearchSelect,
  SelectOption,
} from '../../../../../shared/components/search-select/search-select';
import { t } from '../../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import {
  AssetInspection,
  InspectionDue,
  formatCheckValue,
  intervalText,
} from '../../../../inspections/data-access/inspection.service';
import { InventoryImage, InventoryItem } from '../../../data-access/inventory-api.service';

/** One line in the details of the data sheet; `wide` spans the whole row (long texts). */
export interface AssetPrintDetail {
  label: string;
  value: string;
  wide?: boolean;
}

type ImageMode = 'none' | 'main' | 'all';

/**
 * Printable data sheet of one asset: details, images, the last inspection, due dates and
 * linked assets. What goes on paper is chosen in the print dialog.
 */
@Component({
  selector: 'app-asset-print',
  imports: [DatePipe, FormsModule, PrintDocument, SearchSelect, TranslatePipe],
  templateUrl: './asset-print.html',
})
export class AssetPrint {
  @Input({ required: true }) asset!: InventoryItem;
  @Input() details: AssetPrintDetail[] = [];
  @Input() typeName: string | null = null;
  @Input() locationPath: string | null = null;
  @Input() areaNames: string[] = [];
  @Input() images: InventoryImage[] = [];
  /** Inspections the asset was part of (only loaded for users who may inspect). */
  @Input() inspections: AssetInspection[] = [];
  @Input() schedules: InspectionDue[] = [];
  @Input() parent: InventoryItem | null = null;
  @Input() children: InventoryItem[] = [];
  @Output() readonly closed = new EventEmitter<void>();
  /** Other data sheets included in the same print job. */
  private peers: AssetPrint[] = [];

  @ViewChild(PrintDocument) private document?: PrintDocument;

  protected imageMode: ImageMode = 'all';
  protected readonly imageModes: SelectOption[] = [
    { value: 'all', label: t('assetPrint.imageModes.all') },
    { value: 'main', label: t('assetPrint.imageModes.main') },
    { value: 'none', label: t('assetPrint.imageModes.none') },
  ];
  protected printInspection = true;
  protected printSchedules = true;
  protected printLinks = true;
  protected readonly result = inspectionResult;
  protected readonly formatValue = formatCheckValue;
  protected readonly intervalText = intervalText;

  open(): void {
    this.peers = [];
    this.document?.open();
  }

  openBatch(peers: AssetPrint[]): void {
    this.peers = peers;
    this.document?.open();
  }

  protected get additionalDocuments(): PrintDocument[] {
    return this.peers.flatMap((peer) => (peer.document ? [peer.document] : []));
  }

  protected get batchCount(): number {
    return this.peers.length + 1;
  }

  protected get hasImages(): boolean {
    return [this, ...this.peers].some((sheet) => sheet.images.length > 0);
  }

  protected get hasInspection(): boolean {
    return [this, ...this.peers].some((sheet) => !!sheet.lastInspection);
  }

  protected get hasSchedules(): boolean {
    return [this, ...this.peers].some((sheet) => sheet.schedules.length > 0);
  }

  protected get hasLinks(): boolean {
    return [this, ...this.peers].some((sheet) => !!sheet.parent || sheet.children.length > 0);
  }

  protected prepareBatch(): void {
    for (const peer of this.peers) {
      peer.imageMode = this.imageMode;
      peer.printInspection = this.printInspection;
      peer.printSchedules = this.printSchedules;
      peer.printLinks = this.printLinks;
    }
  }

  /** The asset's result in its most recent inspection that already has one. */
  protected get lastInspection(): AssetInspection | null {
    const time = (entry: AssetInspection) =>
      Date.parse(entry.checkedAt ?? entry.completedAt ?? entry.createdAt) || 0;
    return this.inspections
      .filter((entry) => entry.checkedAt || entry.inspectionStatus === 'COMPLETED')
      .reduce<AssetInspection | null>(
        (latest, entry) => (!latest || time(entry) > time(latest) ? entry : latest),
        null,
      );
  }

  protected get meta(): PrintMeta[] {
    const date = (value: string | null | undefined) =>
      value ? formatDate(value, 'dd.MM.yyyy', 'en-US') : '';
    const last = this.lastInspection;
    return [
      { label: t('terms.invId'), value: this.asset.invId },
      { label: t('terms.assetType'), value: this.typeName },
      { label: t('terms.location'), value: this.locationPath },
      { label: t('terms.area'), value: this.areaNames.join(', ') },
      { label: t('assetPrint.meta.createdAt'), value: date(this.asset.createdAt) },
      {
        label: t('assetPrint.meta.lastInspection'),
        value: last
          ? [date(last.checkedAt ?? last.completedAt), this.result(last).label]
              .filter(Boolean)
              .join(' · ')
          : t('assetPrint.meta.neverChecked'),
      },
    ];
  }

  protected get mainImage(): InventoryImage | null {
    return this.imageMode === 'none' ? null : (this.images[0] ?? null);
  }

  protected get moreImages(): InventoryImage[] {
    return this.imageMode === 'all' ? this.images.slice(1) : [];
  }

  protected source(image: InventoryImage): string {
    return image.url || image.thumbnailUrl || '';
  }
}
