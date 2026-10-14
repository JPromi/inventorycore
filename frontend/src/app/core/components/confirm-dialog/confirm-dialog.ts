import { AsyncPipe } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { LucideTriangleAlert } from '@lucide/angular';

import { ConfirmDialogService } from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  imports: [AsyncPipe, LucideTriangleAlert],
  template: `
    @if (dialog.request$ | async; as request) {
      <div class="backdrop" (click)="dialog.close(false)">
        <div class="dialog" role="alertdialog" aria-modal="true" [attr.aria-label]="request.title" (click)="$event.stopPropagation()">
          <div class="body">
            @if (request.danger) {
              <span class="icon"><svg lucideTriangleAlert size="20"></svg></span>
            }
            <div>
              <h2>{{ request.title }}</h2>
              <p>{{ request.message }}</p>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="secondary" (click)="dialog.close(false)">Abbrechen</button>
            <button type="button" class="primary" [class.danger]="request.danger" (click)="dialog.close(true)" autofocus>
              {{ request.confirmLabel ?? 'Bestätigen' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: var(--overlay);
    }
    .dialog {
      width: min(100%, 26rem);
      padding: 1.25rem;
      border-radius: var(--radius-lg);
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow-md);
    }
    .body {
      display: flex;
      gap: .85rem;
    }
    .icon {
      width: 2.5rem;
      height: 2.5rem;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
    }
    h2 {
      margin-bottom: .35rem;
      font-size: 1.05rem;
    }
    p {
      color: var(--text-muted);
      font-size: .9rem;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: .5rem;
      margin-top: 1.25rem;
    }
    button {
      min-height: 2.25rem;
      padding: 0 .9rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
    }
    .secondary:hover {
      background: var(--surface-hover);
    }
    .primary {
      border-color: var(--text);
      background: var(--text);
      color: var(--surface);
    }
    .primary.danger {
      border-color: var(--accent);
      background: var(--accent);
    }
  `,
})
export class ConfirmDialog {
  constructor(protected readonly dialog: ConfirmDialogService) {}

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.dialog.request$.value) {
      this.dialog.close(false);
    }
  }
}
