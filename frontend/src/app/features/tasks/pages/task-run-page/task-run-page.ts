import { DatePipe, NgTemplateOutlet, formatDate } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideBoxes,
  LucideCheck,
  LucideCircleCheck,
  LucideListChecks,
  LucideLock,
  LucideMessageSquare,
  LucidePencil,
  LucidePrinter,
  LucideRotateCcw,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { switchMap } from 'rxjs/operators';

import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  PrintDocument,
  PrintMeta,
} from '../../../../shared/components/print-document/print-document';
import {
  TaskEntryStatus,
  TaskRunDetail,
  TaskRunEntry,
  TaskService,
} from '../../data-access/task.service';

/** Checklist points of one affected asset. */
interface AssetGroup {
  assetUuid: string;
  assetName: string;
  invId: string | null;
  assetTypeName: string | null;
  locationName: string | null;
  assetVisible: boolean;
  entries: TaskRunEntry[];
}

type SaveState = 'saving' | 'saved' | 'error';

/** Typing pause before a comment is saved. */
const COMMENT_DELAY_MS = 700;

/** Carry out one run of a task; once completed it shows the read-only protocol, which can be printed. */
@Component({
  selector: 'app-task-run-page',
  imports: [
    DatePipe,
    FormsModule,
    NgTemplateOutlet,
    PrintDocument,
    RouterLink,
    TranslatePipe,
    LucideArrowLeft,
    LucideBoxes,
    LucideCheck,
    LucideCircleCheck,
    LucideListChecks,
    LucideLock,
    LucideMessageSquare,
    LucidePencil,
    LucidePrinter,
    LucideRotateCcw,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './task-run-page.html',
  styleUrl: './task-run-page.scss',
})
export class TaskRunPage implements OnInit, OnDestroy {
  @ViewChild(PrintDocument) private printDocument?: PrintDocument;

  protected detail: TaskRunDetail | null = null;
  protected general: TaskRunEntry[] = [];
  protected assetGroups: AssetGroup[] = [];
  protected loading = false;
  protected error = '';
  protected completing = false;
  protected submitting = false;
  protected comment = '';
  /** comment drafts while typing, by entry uuid */
  protected drafts = new Map<string, string>();
  protected saveStates = new Map<string, SaveState>();
  /** entries whose comment field was opened (fields with a comment are always shown) */
  protected openComments = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  protected readonly printSignatures = [t('tasks.run.print.doneBy'), t('tasks.run.print.responsible')];

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly api: TaskService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly confirm: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.loading = true;
          this.detail = null;
          return this.api.run(params.get('uuid') ?? '');
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => {
          this.setDetail(detail);
          this.loading = false;
        },
        error: (error) => {
          this.error =
            error?.status === 404 ? t('common.errors.notFound') : t('common.errors.load');
          this.loading = false;
        },
      });
  }

  ngOnDestroy(): void {
    // comments still waiting for their typing pause are saved now
    for (const uuid of [...this.timers.keys()]) {
      this.flushComment(uuid);
    }
  }

  protected get open(): boolean {
    return this.detail?.summary.status === 'OPEN';
  }

  protected get canWork(): boolean {
    return !!this.detail?.canWork && this.open;
  }

  protected get progress(): number {
    const counts = this.detail?.summary.counts;
    return counts?.total ? Math.round(((counts.total - counts.pending) / counts.total) * 100) : 100;
  }

  protected isSet(value: string | null): boolean {
    return !!value;
  }

  protected entriesWith(status: TaskEntryStatus): TaskRunEntry[] {
    return this.detail?.entries.filter((entry) => entry.status === status) ?? [];
  }

  protected statusLabel(status: TaskEntryStatus): string {
    return t(`taskEntryStatus.${status}`);
  }

  /** Clicking the active result again resets the point to "not worked on". */
  protected setStatus(entry: TaskRunEntry, status: TaskEntryStatus): void {
    if (!this.canWork) {
      return;
    }
    const next: TaskEntryStatus = entry.status === status ? 'PENDING' : status;
    const previous = entry.status;
    entry.status = next;
    this.recount();
    this.api.updateEntry(this.detail!.summary.uuid, entry.uuid, { status: next }).subscribe({
      next: (updated) => this.replace(updated),
      error: (error) => {
        entry.status = previous;
        this.recount();
        this.handleError(error, t('tasks.run.errors.save'));
      },
    });
  }

  /** Done / pending with the check box; "not done" is a separate button. */
  protected toggleDone(entry: TaskRunEntry): void {
    this.setStatus(entry, 'DONE');
  }

  protected showsComment(entry: TaskRunEntry): boolean {
    return this.openComments.has(entry.uuid) || !!this.commentValue(entry);
  }

  protected openComment(entry: TaskRunEntry): void {
    this.openComments.add(entry.uuid);
    // the field exists after the next rendering
    setTimeout(() => document.getElementById(`comment-${entry.uuid}`)?.focus());
  }

  /** "2/3" for the heading of a group. */
  protected doneText(entries: TaskRunEntry[]): string {
    return `${entries.filter((entry) => entry.status !== 'PENDING').length}/${entries.length}`;
  }

  protected commentValue(entry: TaskRunEntry): string {
    return this.drafts.get(entry.uuid) ?? entry.comment ?? '';
  }

  protected commentChanged(entry: TaskRunEntry, value: string): void {
    this.drafts.set(entry.uuid, value);
    this.saveStates.delete(entry.uuid);
    clearTimeout(this.timers.get(entry.uuid));
    this.timers.set(
      entry.uuid,
      setTimeout(() => this.flushComment(entry.uuid), COMMENT_DELAY_MS),
    );
  }

  protected flushComment(uuid: string): void {
    clearTimeout(this.timers.get(uuid));
    this.timers.delete(uuid);
    const draft = this.drafts.get(uuid);
    const entry = this.detail?.entries.find((candidate) => candidate.uuid === uuid);
    if (draft === undefined || !entry || !this.canWork || draft === (entry.comment ?? '')) {
      return;
    }
    this.saveStates.set(uuid, 'saving');
    this.api.updateEntry(this.detail!.summary.uuid, uuid, { comment: draft }).subscribe({
      next: (updated) => {
        // a newer draft typed meanwhile stays
        if (this.drafts.get(uuid) === draft) {
          this.drafts.delete(uuid);
        }
        this.replace(updated);
        this.saveStates.set(uuid, 'saved');
      },
      error: (error) => {
        this.saveStates.set(uuid, 'error');
        this.handleError(error, t('tasks.run.errors.save'));
      },
    });
  }

  protected startCompleting(): void {
    for (const uuid of [...this.timers.keys()]) {
      this.flushComment(uuid);
    }
    this.comment = '';
    this.completing = true;
  }

  protected complete(): void {
    if (!this.detail || this.submitting) {
      return;
    }
    this.submitting = true;
    this.api.complete(this.detail.summary.uuid, this.comment).subscribe({
      next: (detail) => {
        this.submitting = false;
        this.completing = false;
        this.setDetail(detail);
      },
      error: (error) => {
        this.submitting = false;
        this.handleError(error, t('tasks.run.errors.complete'));
      },
    });
  }

  protected async remove(): Promise<void> {
    const detail = this.detail;
    if (!detail || !(await this.confirm.confirmDelete(detail.summary.title))) {
      return;
    }
    this.api.deleteRun(detail.summary.uuid).subscribe({
      next: () => this.router.navigate(['/tasks']),
      error: (error) => this.handleError(error, t('common.errors.delete')),
    });
  }

  /** Starts the task again (or opens its open run). */
  protected restart(): void {
    const taskUuid = this.detail?.summary.taskUuid;
    if (!taskUuid) {
      return;
    }
    this.api.start(taskUuid).subscribe({
      next: (run) => this.router.navigate(['/tasks', run.uuid]),
      error: (error) => this.handleError(error, t('tasks.errors.start')),
    });
  }

  protected print(): void {
    this.printDocument?.open();
  }

  /** Header of the printed protocol: what, when, who. */
  protected get printMeta(): PrintMeta[] {
    const summary = this.detail?.summary;
    if (!summary) {
      return [];
    }
    const date = (value: string | null, pattern = 'dd.MM.yyyy HH:mm') =>
      value ? formatDate(value, pattern, 'en-US') : '';
    return [
      { label: t('tasks.run.dueDate'), value: date(summary.dueDate, 'dd.MM.yyyy') },
      {
        label: t('tasks.run.completed'),
        value: [date(summary.completedAt), summary.completedByName].filter(Boolean).join(' · '),
      },
      { label: t('tasks.form.assignees'), value: summary.assigneeNames },
      { label: t('terms.area'), value: summary.areaName },
      { label: t('tasks.run.scope'), value: summary.scopeSummary },
    ];
  }

  private setDetail(detail: TaskRunDetail): void {
    this.detail = detail;
    this.general = detail.entries.filter((entry) => !entry.assetUuid);
    const groups = new Map<string, AssetGroup>();
    for (const entry of detail.entries) {
      if (!entry.assetUuid) {
        continue;
      }
      let group = groups.get(entry.assetUuid);
      if (!group) {
        group = {
          assetUuid: entry.assetUuid,
          assetName: entry.assetName ?? '',
          invId: entry.invId,
          assetTypeName: entry.assetTypeName,
          locationName: entry.locationName,
          assetVisible: entry.assetVisible,
          entries: [],
        };
        groups.set(entry.assetUuid, group);
      }
      group.entries.push(entry);
    }
    this.assetGroups = [...groups.values()];
  }

  /** Puts the server's answer in place of the entry (keeps the groups' references). */
  private replace(updated: TaskRunEntry): void {
    const entry = this.detail?.entries.find((candidate) => candidate.uuid === updated.uuid);
    if (entry) {
      Object.assign(entry, updated);
      this.recount();
    }
  }

  private recount(): void {
    const detail = this.detail;
    if (!detail) {
      return;
    }
    const count = (status: TaskEntryStatus) =>
      detail.entries.filter((entry) => entry.status === status).length;
    detail.summary.counts = {
      total: detail.entries.length,
      done: count('DONE'),
      notDone: count('NOT_DONE'),
      pending: count('PENDING'),
    };
  }

  private handleError(error: { status?: number } | null, fallback: string): void {
    if (error?.status === 409) {
      this.error = t('tasks.run.errors.completed');
      // someone else completed it: show the protocol
      this.api.run(this.detail!.summary.uuid).subscribe((detail) => this.setDetail(detail));
      return;
    }
    this.error = error?.status === 403 ? t('common.errors.forbidden') : fallback;
  }
}
