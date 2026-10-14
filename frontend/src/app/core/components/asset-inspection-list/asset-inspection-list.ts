import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideClipboardCheck } from '@lucide/angular';

import { AssetInspection, formatCheckValue } from '../../service/inspection.service';

type Tone = 'good' | 'bad' | 'warn' | 'neutral';

/** Inspections an asset was part of, with its result and check values. */
@Component({
  selector: 'app-asset-inspection-list',
  imports: [DatePipe, RouterLink, LucideClipboardCheck],
  templateUrl: './asset-inspection-list.html',
  styleUrl: './asset-inspection-list.scss',
})
export class AssetInspectionList {
  @Input() entries: AssetInspection[] = [];

  protected readonly formatCheckValue = formatCheckValue;

  protected result(entry: AssetInspection): { label: string; tone: Tone } {
    if (!entry.expected) {
      return { label: 'Als fremder Gegenstand gefunden', tone: 'warn' };
    }
    switch (entry.status) {
      case 'PRESENT':
        return entry.condition === 'DEFECT'
          ? { label: 'Da, defekt', tone: 'bad' }
          : { label: entry.condition === 'OK' ? 'Da, in Ordnung' : 'Da', tone: 'good' };
      case 'MISSING':
        return { label: 'Fehlt', tone: 'bad' };
      case 'PASSED':
        return { label: 'In Ordnung', tone: 'good' };
      case 'FAILED':
        return { label: 'Mangel', tone: 'bad' };
      default:
        return entry.inspectionStatus === 'OPEN' ? { label: 'Noch nicht geprüft', tone: 'neutral' } : { label: 'Nicht geprüft', tone: 'bad' };
    }
  }
}
