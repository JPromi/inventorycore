import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCamera,
  LucideClipboardCheck,
  LucideLock,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideScanBarcode,
  LucideTrash2,
} from '@lucide/angular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { auditDetailLines } from '../../../features/audit/data-access/audit-text';
import {
  AuditLog,
  auditActionLabel,
  auditObjectRoute,
  auditObjectTypeLabel,
} from '../../../features/audit/data-access/audit.service';

/** Activity log entries as a timeline: what, who, when and the changed values. */
@Component({
  selector: 'app-audit-timeline',
  imports: [
    DatePipe,
    RouterLink,
    TranslatePipe,
    LucideCamera,
    LucideClipboardCheck,
    LucideLock,
    LucidePencil,
    LucidePlus,
    LucideRefreshCw,
    LucideScanBarcode,
    LucideTrash2,
  ],
  templateUrl: './audit-timeline.html',
  styleUrl: './audit-timeline.scss',
})
export class AuditTimeline {
  @Input() entries: AuditLog[] = [];
  /** Name and kind of the object (for the overview of everything; not needed on the object's own page). */
  @Input() showObject = false;

  protected readonly actionLabel = auditActionLabel;
  protected readonly typeLabel = auditObjectTypeLabel;
  protected readonly route = auditObjectRoute;

  /** Text of the details (the server stores them language neutral); null when there are none. */
  protected lines(log: AuditLog): string[] | null {
    const lines = log.details.flatMap(auditDetailLines);
    return lines.length ? lines : null;
  }
}
