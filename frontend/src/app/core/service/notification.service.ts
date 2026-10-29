import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, firstValueFrom, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface NotificationPreferences {
  inbox: boolean;
  email: boolean;
  push: boolean;
  daysBefore: number;
  overdueInbox: boolean;
  overdueEmail: boolean;
  overduePush: boolean;
  emailAddress: string | null;
  emailAvailable: boolean;
  pushPublicKey: string;
}
export interface NotificationMessage {
  uuid: string;
  title: string;
  body: string;
  assetUuid: string;
  createdAt: string;
  readAt: string | null;
}
export interface MailSettings {
  enabled: boolean;
  host: string | null;
  port: number;
  username: string | null;
  password: string | null;
  passwordConfigured: boolean;
  fromAddress: string | null;
  startTls: boolean;
}
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly url = environment.apiUrl;
  readonly unread = new BehaviorSubject(0);
  constructor(
    private readonly http: HttpClient,
    readonly swPush: SwPush,
    private readonly zone: NgZone,
  ) {}
  inbox() {
    return this.http
      .get<NotificationMessage[]>(this.url + '/notifications', { withCredentials: true })
      .pipe(
        tap((items) =>
          this.zone.run(() => this.unread.next(items.filter((item) => !item.readAt).length)),
        ),
      );
  }
  preferences() {
    return this.http.get<NotificationPreferences>(this.url + '/notifications/preferences', {
      withCredentials: true,
    });
  }
  savePreferences(value: NotificationPreferences) {
    return this.http.put<NotificationPreferences>(this.url + '/notifications/preferences', value, {
      withCredentials: true,
    });
  }
  read(uuid: string) {
    return this.http.put<void>(
      this.url + '/notifications/' + uuid + '/read',
      {},
      { withCredentials: true },
    );
  }
  mailSettings() {
    return this.http.get<MailSettings>(this.url + '/admin/notifications', {
      withCredentials: true,
    });
  }
  saveMailSettings(value: MailSettings) {
    return this.http.put<MailSettings>(this.url + '/admin/notifications', value, {
      withCredentials: true,
    });
  }
  async enableDevice(publicKey: string): Promise<void> {
    const subscription = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
    try {
      await firstValueFrom(
        this.http.post<void>(this.url + '/notifications/subscriptions', subscription.toJSON(), {
          withCredentials: true,
        }),
      );
    } catch (error) {
      await this.swPush.unsubscribe();
      throw error;
    }
  }
  async disableDevice(): Promise<void> {
    if (!this.swPush.isEnabled) return;
    const subscription = await firstValueFrom(this.swPush.subscription);
    if (!subscription) return;
    try {
      await firstValueFrom(
        this.http.delete<void>(this.url + '/notifications/subscriptions', {
          body: { endpoint: subscription.endpoint },
          withCredentials: true,
        }),
      );
    } finally {
      // Stop this browser's delivery even when the server is temporarily unreachable.
      await this.swPush.unsubscribe();
    }
  }
}
