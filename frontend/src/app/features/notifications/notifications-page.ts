import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';
import {
  MailSettings,
  NotificationMessage,
  NotificationService,
} from '../../core/service/notification.service';

@Component({
  selector: 'app-notifications-page',
  imports: [FormsModule, TranslatePipe, DatePipe, RouterLink],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
})
export class NotificationsPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly service = inject(NotificationService);
  readonly admin = inject(ActivatedRoute).snapshot.data['notificationAdmin'] === true;
  mail: MailSettings | null = null;
  messages: NotificationMessage[] = [];
  loading = true;
  busy = false;
  status = '';
  error = '';
  private inboxRequest?: Subscription;
  ngOnInit(): void {
    if (!this.admin) {
      this.reload();
      return;
    }
    this.service
      .mailSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.mail = value;
          this.loading = false;
        },
        error: () => {
          this.error = t('notifications.loadError');
          this.loading = false;
        },
      });
  }
  reload(): void {
    this.inboxRequest?.unsubscribe();
    this.inboxRequest = this.service
      .inbox()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.messages = items;
          this.loading = false;
        },
        error: () => {
          this.error = t('notifications.loadError');
          this.loading = false;
        },
      });
  }
  save(): void {
    this.error = '';
    this.status = '';
    this.busy = true;
    if (!this.mail) {
      this.busy = false;
      return;
    }
    const request = this.service.saveMailSettings({
      ...this.mail,
      password: this.mail.password || null,
    });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.mail = value;
        this.busy = false;
        this.status = t('notifications.saved');
      },
      error: () => {
        this.busy = false;
        this.error = t('notifications.saveError');
      },
    });
  }
  read(message: NotificationMessage): void {
    this.service
      .read(message.uuid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload(),
        error: () => (this.error = t('notifications.saveError')),
      });
  }
}
