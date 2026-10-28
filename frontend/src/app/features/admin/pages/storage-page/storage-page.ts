import { Component, OnInit } from '@angular/core';
import { LucideDatabase, LucideHardDrive, LucideImage, LucideRefreshCw } from '@lucide/angular';

import { currentLanguage, t } from '../../../../core/i18n/i18n';
import { TranslateCountPipe, TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AdminApiService, StorageUsage, StorageUserUsage } from '../../data-access/admin-api.service';

/** Tables shown before "show all". */
const TABLE_LIMIT = 10;
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** How much storage the database and the uploaded images take, per user (admins only). */
@Component({
  selector: 'app-storage-page',
  imports: [TranslatePipe, TranslateCountPipe, LucideDatabase, LucideHardDrive, LucideImage, LucideRefreshCw],
  templateUrl: './storage-page.html',
  styleUrl: './storage-page.scss',
})
export class StoragePage implements OnInit {
  protected usage: StorageUsage | null = null;
  protected loading = false;
  protected error = '';
  protected showAllTables = false;
  protected readonly tableLimit = TABLE_LIMIT;

  constructor(private readonly api: AdminApiService) {}

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading = true;
    this.error = '';
    this.api.storageUsage().subscribe({
      next: (usage) => {
        this.usage = usage;
        this.loading = false;
      },
      error: () => {
        this.error = t('adminStorage.errors.load');
        this.loading = false;
      },
    });
  }

  protected get fileSize(): number {
    return this.usage ? this.usage.files.contentSize + this.usage.files.previewSize : 0;
  }

  protected get profileImageSize(): number {
    return this.usage?.users.reduce((sum, user) => sum + user.profileImageSize, 0) ?? 0;
  }

  /** Database and files; profile images are stored in the database and already part of its size. */
  protected get totalSize(): number {
    return this.usage ? this.usage.database.size + this.fileSize : 0;
  }

  protected get volumeUsed(): number | null {
    const files = this.usage?.files;
    return files?.volumeTotal == null || files.volumeUsable == null
      ? null
      : files.volumeTotal - files.volumeUsable;
  }

  protected get tables(): StorageUsage['database']['tables'] {
    const tables = this.usage?.database.tables ?? [];
    return this.showAllTables ? tables : tables.slice(0, TABLE_LIMIT);
  }

  protected userTotal(user: StorageUserUsage): number {
    return user.fileSize + user.profileImageSize;
  }

  /** Share of the largest user, for the bar in the list. */
  protected userShare(user: StorageUserUsage): number {
    const largest = Math.max(...(this.usage?.users ?? []).map((entry) => this.userTotal(entry)), 0);
    return largest ? (this.userTotal(user) / largest) * 100 : 0;
  }

  /** Share of all uploads and profile images. */
  protected userPercent(user: StorageUserUsage): string {
    const all = this.fileSize + this.profileImageSize;
    return this.percent(all ? this.userTotal(user) / all : 0);
  }

  protected userName(user: StorageUserUsage): string {
    if (!user.uuid) {
      return t('adminStorage.unknownUploader');
    }
    return user.displayName || user.username || t('common.unknown');
  }

  protected percent(fraction: number): string {
    return new Intl.NumberFormat(currentLanguage(), {
      style: 'percent',
      maximumFractionDigits: fraction > 0 && fraction < 0.01 ? 1 : 0,
    }).format(fraction);
  }

  protected bytes(value: number | null | undefined): string {
    if (value == null) {
      return '—';
    }
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < UNITS.length - 1) {
      size /= 1024;
      unit++;
    }
    const digits = unit === 0 || size >= 100 ? 0 : 1;
    return `${new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: digits }).format(size)} ${UNITS[unit]}`;
  }

  protected count(value: number): string {
    return new Intl.NumberFormat(currentLanguage()).format(value);
  }

  protected date(value: string | null): string {
    return value ? new Date(value).toLocaleDateString(currentLanguage()) : '—';
  }
}
