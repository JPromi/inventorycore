import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCircleCheck, LucideCircleX, LucideFolderSync, LucideNetwork, LucidePlugZap, LucideSave } from '@lucide/angular';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { MultiSelect } from '../../../components/multi-select/multi-select';
import { SelectOption } from '../../../components/search-select/search-select';
import { t } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/translate.pipe';
import { AdminApiService, LdapSettings, LdapSyncResult, LdapTestResult } from '../../../service/admin-api.service';

type LdapPreset = 'ad' | 'openldap' | 'ucs';

@Component({
  selector: 'app-ldap-settings-page',
  imports: [DatePipe, FormsModule, MultiSelect, TranslatePipe, LucideCircleCheck, LucideCircleX, LucideFolderSync, LucideNetwork, LucidePlugZap, LucideSave],
  templateUrl: './ldap-settings-page.html',
  styleUrl: './ldap-settings-page.scss',
})
export class LdapSettingsPage implements OnInit {
  protected settings: LdapSettings | null = null;
  protected loading = false;
  protected saving = false;
  protected testing = false;
  protected syncing = false;
  protected error = '';
  protected saved = false;
  protected testResult: LdapTestResult | null = null;
  protected syncResult: LdapSyncResult | null = null;
  /** Sync works on the stored settings, so it needs a save first. */
  protected dirty = false;
  protected availableGroups: string[] = [];
  protected selectedGroups: string[] = [];
  private groupFilterBase: string | null = null;

  protected get maxSyncInterval(): number {
    return this.settings?.syncIntervalUnit === 'MINUTES' ? 525600
      : this.settings?.syncIntervalUnit === 'DAYS' ? 365 : 8760;
  }

  protected get groupOptions(): SelectOption[] {
    return [...new Set([...this.availableGroups, ...this.selectedGroups])]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }

  protected selectGroups(names: string[]): void {
    const settings = this.settings;
    if (!settings) return;
    const attribute = settings.groupNameAttribute ?? '';
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(attribute)) {
      this.error = t('adminLdap.errors.invalidGroupNameAttribute');
      return;
    }
    this.groupFilterBase ??= settings.groupFilter ?? '(objectClass=*)';
    this.selectedGroups = [...names];
    const escape = (value: string) => value.replace(/[\\*()\x00]/g,
      (character) => '\\' + character.charCodeAt(0).toString(16).padStart(2, '0'));
    const choices = [...names].sort().map((name) => `(${attribute}=${escape(name)})`).join('');
    settings.groupFilter = names.length ? `(&${this.groupFilterBase}(|${choices}))` : this.groupFilterBase;
    this.changed();
  }

  protected groupFilterEdited(): void {
    this.selectedGroups = [];
    this.groupFilterBase = null;
    this.changed();
  }

  constructor(
    private readonly api: AdminApiService,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.ldapSettings().subscribe({
      next: (settings) => {
        this.settings = { ...settings, bindPassword: '' };
        this.loading = false;
      },
      error: () => {
        this.error = t('adminLdap.errors.load');
        this.loading = false;
      },
    });
  }

  protected get isLdaps(): boolean {
    return !!this.settings?.url?.toLowerCase().startsWith('ldaps://');
  }

  protected changed(): void {
    this.dirty = true;
    this.saved = false;
  }

  /** Fills filters and attribute names with the usual values of the directory type. */
  protected applyPreset(preset: LdapPreset): void {
    if (!this.settings) {
      return;
    }
    if (preset === 'ad') {
      Object.assign(this.settings, {
        userFilter: '(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
        usernameAttribute: 'sAMAccountName',
        displayNameAttribute: 'displayName',
        emailAttribute: 'mail',
        groupFilter: '(objectClass=group)',
        groupNameAttribute: 'cn',
        groupMemberAttribute: 'member',
      });
    } else if (preset === 'ucs') {
      // Univention OpenLDAP (port 7389/7636 when Samba AD runs on the same host)
      Object.assign(this.settings, {
        userFilter: '(&(objectClass=posixAccount)(objectClass=person)(!(uid=*$))(!(shadowExpire=1)))',
        usernameAttribute: 'uid',
        displayNameAttribute: 'displayName',
        emailAttribute: 'mailPrimaryAddress',
        groupFilter: '(objectClass=univentionGroup)',
        groupNameAttribute: 'cn',
        groupMemberAttribute: 'uniqueMember',
      });
    } else {
      Object.assign(this.settings, {
        userFilter: '(objectClass=inetOrgPerson)',
        usernameAttribute: 'uid',
        displayNameAttribute: 'cn',
        emailAttribute: 'mail',
        groupFilter: '(|(objectClass=groupOfNames)(objectClass=posixGroup))',
        groupNameAttribute: 'cn',
        groupMemberAttribute: 'member',
      });
    }
    this.changed();
    this.availableGroups = [];
    this.selectedGroups = [];
    this.groupFilterBase = null;
    this.testResult = null;
  }

  protected save(): void {
    if (!this.settings || this.saving) {
      return;
    }
    if (!Number.isInteger(this.settings.syncIntervalValue)
      || this.settings.syncIntervalValue < 1 || this.settings.syncIntervalValue > this.maxSyncInterval) {
      this.error = t('adminLdap.errors.syncInterval');
      return;
    }
    this.saving = true;
    this.error = '';
    this.api.saveLdapSettings(this.settings).subscribe({
      next: (settings) => {
        this.settings = { ...settings, bindPassword: '' };
        this.saving = false;
        this.saved = true;
        this.dirty = false;
      },
      error: () => {
        this.saving = false;
        this.error = t('common.errors.save');
      },
    });
  }

  protected test(): void {
    if (!this.settings || this.testing) {
      return;
    }
    this.testing = true;
    this.testResult = null;
    this.api.testLdap(this.settings).subscribe({
      next: (result) => {
        this.testResult = result;
        this.availableGroups = result.success ? result.availableGroups ?? [] : [];
        this.testing = false;
      },
      error: () => {
        this.testResult = { success: false, message: t('adminLdap.errors.test'), userCount: null, groupCount: null, sampleUsers: [], sampleGroups: [] };
        this.testing = false;
      },
    });
  }

  protected async sync(): Promise<void> {
    if (!this.settings || this.syncing) {
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: t('adminLdap.syncConfirm.title'),
      message: this.settings.disableMissingUsers
        ? t('adminLdap.syncConfirm.messageDisableMissing')
        : t('adminLdap.syncConfirm.message'),
      confirmLabel: t('adminLdap.sync'),
    });
    if (!confirmed) {
      return;
    }
    this.syncing = true;
    this.syncResult = null;
    this.api.syncLdap().subscribe({
      next: (result) => {
        this.syncResult = result;
        this.syncing = false;
        if (result.success && this.settings) {
          this.settings.lastSyncAt = new Date().toISOString();
          this.settings.lastSyncResult = result.message;
        }
      },
      error: () => {
        this.syncResult = {
          success: false,
          message: t('adminLdap.errors.sync'),
          usersCreated: 0,
          usersUpdated: 0,
          usersDisabled: 0,
          usersSkipped: 0,
          groupsCreated: 0,
          groupsUpdated: 0,
          groupsDeleted: 0,
        };
        this.syncing = false;
      },
    });
  }
}
