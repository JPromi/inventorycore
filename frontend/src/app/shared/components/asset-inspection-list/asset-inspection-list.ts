import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideClipboardCheck } from '@lucide/angular';

import { t } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import {
  AssetInspection,
  formatCheckValue,
} from '../../../features/inspections/data-access/inspection.service';

export type InspectionResultTone = 'good' | 'bad' | 'warn' | 'neutral';

/** Result of an asset in one inspection, as text and tone. */
export function inspectionResult(entry: AssetInspection): {
  label: string;
  tone: InspectionResultTone;
} {
  if (!entry.expected) {
    return { label: t('assetInspections.result.foreign'), tone: 'warn' };
  }
  switch (entry.status) {
    case 'PRESENT':
      if (entry.condition === 'OK' || entry.condition === 'DEFECT') {
        const label = t('assetInspections.result.withCondition', {
          status: t('inspectionStatus.PRESENT'),
          condition: t(`inspectionCondition.${entry.condition}`),
        });
        return { label, tone: entry.condition === 'DEFECT' ? 'bad' : 'good' };
      }
      return { label: t('inspectionStatus.PRESENT'), tone: 'good' };
    case 'MISSING':
      return { label: t('inspectionStatus.MISSING'), tone: 'bad' };
    case 'PASSED':
      return { label: t('inspectionStatus.PASSED'), tone: 'good' };
    case 'FAILED':
      return { label: t('inspectionStatus.FAILED'), tone: 'bad' };
    default:
      return entry.inspectionStatus === 'OPEN'
        ? { label: t('assetInspections.result.notYetChecked'), tone: 'neutral' }
        : { label: t('inspectionStatus.PENDING'), tone: 'bad' };
  }
}

/** Inspections an asset was part of, with its result and check values. */
@Component({
  selector: 'app-asset-inspection-list',
  imports: [DatePipe, RouterLink, LucideClipboardCheck, TranslatePipe],
  templateUrl: './asset-inspection-list.html',
  styleUrl: './asset-inspection-list.scss',
})
export class AssetInspectionList {
  @Input() entries: AssetInspection[] = [];

  protected readonly formatCheckValue = formatCheckValue;

  protected readonly result = inspectionResult;
}
