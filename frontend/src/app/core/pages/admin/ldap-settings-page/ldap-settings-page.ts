import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCircleCheck, LucideCircleX, LucideFolderSync, LucideNetwork, LucidePlugZap, LucideSave } from '@lucide/angular';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { AdminApiService, LdapSettings, LdapSyncResult, LdapTestResult } from '../../../service/admin-api.service';

type LdapPreset = 'ad' | 'openldap' | 'ucs';

@Component({
  selector: 'app-ldap-settings-page',
  imports: [DatePipe, FormsModule, LucideCircleCheck, LucideCircleX, LucideFolderSync, LucideNetwork, LucidePlugZap, LucideSave],
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
        this.error = 'Einstellungen konnten nicht geladen werden.';
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
  }

  protected save(): void {
    if (!this.settings || this.saving) {
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
        this.error = 'Speichern fehlgeschlagen.';
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
        this.testing = false;
      },
      error: () => {
        this.testResult = { success: false, message: 'Test konnte nicht ausgeführt werden.', userCount: null, groupCount: null, sampleUsers: [], sampleGroups: [] };
        this.testing = false;
      },
    });
  }

  protected async sync(): Promise<void> {
    if (!this.settings || this.syncing) {
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'Jetzt synchronisieren?',
      message: this.settings.disableMissingUsers
        ? 'Benutzer und Gruppen werden aus LDAP importiert. LDAP-Benutzer, die nicht mehr gefunden werden, werden deaktiviert.'
        : 'Benutzer und Gruppen werden aus LDAP importiert und aktualisiert.',
      confirmLabel: 'Synchronisieren',
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
          message: 'Synchronisation fehlgeschlagen.',
          usersCreated: 0,
          usersUpdated: 0,
          usersDisabled: 0,
          usersSkipped: 0,
          groupsCreated: 0,
          groupsUpdated: 0,
        };
        this.syncing = false;
      },
    });
  }
}
