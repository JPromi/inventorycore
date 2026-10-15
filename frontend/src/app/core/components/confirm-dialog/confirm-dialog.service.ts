import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly request$ = new BehaviorSubject<ConfirmRequest | null>(null);

  confirm(options: ConfirmOptions): Promise<boolean> {
    this.request$.value?.resolve(false);
    return new Promise((resolve) => this.request$.next({ ...options, resolve }));
  }

  /** Shortcut for the common "really delete?" question. */
  confirmDelete(name: string): Promise<boolean> {
    return this.confirm({
      title: 'Wirklich löschen?',
      message: `„${name}“ wird gelöscht. Das kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
  }

  close(confirmed: boolean): void {
    const request = this.request$.value;
    this.request$.next(null);
    request?.resolve(confirmed);
  }
}
