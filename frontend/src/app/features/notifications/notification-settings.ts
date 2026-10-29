import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';
import {
  NotificationPreferences,
  NotificationService,
} from '../../core/service/notification.service';

@Component({
  selector: 'app-notification-settings',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './notification-settings.html',
  styleUrl: './notification-settings.scss',
})
export class NotificationSettings implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly service = inject(NotificationService);
  preferences: NotificationPreferences | null = null;
  busy = false;
  status = '';
  error = '';
  deviceEnabled = false;

  get emailSelectable(): boolean {
    const address = this.preferences?.emailAddress ?? '';
    return (
      !!this.preferences?.emailAvailable &&
      address.length <= 254 &&
      /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address)
    );
  }

  addressChanged(): void {
    if (this.preferences && !this.emailSelectable) {
      this.preferences.email = false;
      this.preferences.overdueEmail = false;
    }
  }
  ngOnInit(): void {
    if (this.service.swPush.isEnabled) {
      this.service.swPush.subscription
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((value) => (this.deviceEnabled = !!value));
    }
    this.service
      .preferences()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => (this.preferences = value),
        error: () => (this.error = t('notifications.loadError')),
      });
  }
  save(): void {
    if (!this.preferences) return;
    this.busy = true;
    this.error = '';
    this.status = '';
    this.service
      .savePreferences({
        ...this.preferences,
        email: this.emailSelectable && this.preferences.email,
        overdueEmail: this.emailSelectable && this.preferences.overdueEmail,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.preferences = value;
          this.busy = false;
          this.status = t('notifications.saved');
        },
        error: () => {
          this.busy = false;
          this.error = t('notifications.saveError');
        },
      });
  }
  async enablePush(): Promise<void> {
    if (!this.preferences) return;
    this.busy = true;
    this.error = '';
    this.status = '';
    try {
      await this.service.enableDevice(this.preferences.pushPublicKey);
      this.preferences = await firstValueFrom(
        this.service.savePreferences({
          ...this.preferences,
          push: this.preferences.push || !this.preferences.overduePush,
          email: this.emailSelectable && this.preferences.email,
          overdueEmail: this.emailSelectable && this.preferences.overdueEmail,
        }),
      );
      this.status = t('notifications.deviceEnabled');
    } catch {
      this.error = t('notifications.pushError');
    } finally {
      this.busy = false;
    }
  }
  async disablePush(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      await this.service.disableDevice();
    } catch {
      this.error = t('notifications.pushError');
    } finally {
      this.busy = false;
    }
  }
}
