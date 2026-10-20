import { DatePipe } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideLogIn, LucideLogOut, LucideShieldAlert } from '@lucide/angular';
import { Subscription } from 'rxjs';

import { t } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { describeUserAgent } from '../../../shared/util/user-agent';
import { signInMethod, signInReason } from '../../audit/data-access/audit-text';
import { AuditLog, AuditService } from '../../audit/data-access/audit.service';

/** One entry, prepared for the list. */
interface LoginEntry {
  uuid: string;
  createdAt: string;
  kind: 'in' | 'failed' | 'out';
  method: string | null;
  reason: string | null;
  ip: string | null;
  device: string | null;
  userAgent: string | null;
}

const PAGE_SIZE = 20;

/** Sign-ins, failed sign-ins and sign-outs of one user for admins: when, how, from where, with what. */
@Component({
  selector: 'app-user-logins',
  imports: [DatePipe, TranslatePipe, LucideLogIn, LucideLogOut, LucideShieldAlert],
  templateUrl: './user-logins.html',
  styleUrl: './user-logins.scss',
})
export class UserLogins implements OnChanges {
  @Input({ required: true }) userUuid!: string;

  protected entries: LoginEntry[] = [];
  protected total = 0;
  protected loading = false;
  protected error = '';
  private page = 0;
  private request?: Subscription;

  constructor(
    private readonly audit: AuditService,
    private readonly destroyRef: DestroyRef,
  ) {}

  ngOnChanges(): void {
    this.entries = [];
    this.page = 0;
    this.load();
  }

  protected get hasMore(): boolean {
    return this.entries.length < this.total;
  }

  protected more(): void {
    this.page++;
    this.load();
  }

  private load(): void {
    this.request?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.request = this.audit
      .userLogins(this.userUuid, this.page, PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.entries = [...this.entries, ...result.items.map(toEntry)];
          this.total = result.total;
          this.loading = false;
        },
        error: () => {
          this.error = t('adminUserForm.logins.loadError');
          this.loading = false;
        },
      });
  }
}

function toEntry(log: AuditLog): LoginEntry {
  const params = log.details.find((detail) => detail.code)?.params ?? {};
  const text = (key: string) => (params[key] == null ? null : String(params[key]));
  const userAgent = text('userAgent');
  return {
    uuid: log.uuid,
    createdAt: log.createdAt,
    kind: log.action === 'LOGIN' ? 'in' : log.action === 'LOGOUT' ? 'out' : 'failed',
    method: text('method') ? signInMethod(text('method')!) : null,
    reason: log.action === 'LOGIN_FAILED' ? signInReason(text('reason') ?? '') : null,
    ip: text('ip'),
    device: describeUserAgent(userAgent) ?? userAgent,
    userAgent,
  };
}
