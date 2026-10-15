import { expect, test } from '@playwright/test';
import { pageOf } from './support/paging';

const settings = {
  enabled: true, url: 'ldap://directory.example', ignoreCertificates: false,
  bindDn: 'cn=reader,dc=example', bindPassword: '', bindPasswordSet: true,
  baseDn: 'dc=example', userSearchBase: '', userFilter: '(objectClass=person)',
  usernameAttribute: 'uid', displayNameAttribute: 'displayName', emailAttribute: 'mail',
  groupSearchBase: '', groupFilter: '(objectClass=group)', groupNameAttribute: 'cn',
  groupMemberAttribute: 'member', loginEnabled: true, disableMissingUsers: true,
  syncIntervalValue: 6, syncIntervalUnit: 'HOURS',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/auth/me'
      ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', sourceProvider: 'LOCAL', permissions: [] }
      : path === '/api/admin/ldap' ? settings : [];
    await route.fulfill({ json: body });
  });
});

test('loads LDAP settings and connection results without an extra click', async ({ page }) => {
  await page.route('**/api/admin/ldap/test', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ json: { success: true, message: 'Connection result ready', userCount: 1, groupCount: 1, sampleUsers: ['alice'], sampleGroups: ['Members'], availableGroups: ['Members'] } });
  });
  await page.goto('/admin/ldap');
  await expect(page.locator('input[name="url"]')).toHaveValue(settings.url);
  await page.getByRole('button', { name: 'Verbindung testen', exact: true }).click();
  await expect(page.getByText('Connection result ready', { exact: true })).toBeVisible();
});

for (const success of [true, false]) {
  test(`updates LDAP sync ${success ? 'success' : 'error'} after awaiting confirmation without another click`, async ({ page }) => {
    await page.route('**/api/admin/ldap/sync', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: success ? 200 : 500, json: { success, message: 'Sync result ready', usersCreated: 1, usersUpdated: 0, usersDisabled: 0, usersSkipped: 0, groupsCreated: 0, groupsUpdated: 0, groupsDeleted: 0 } });
    });
    await page.goto('/admin/ldap');
    await page.getByRole('button', { name: 'Synchronisieren', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Synchronisieren', exact: true }).click();
    await expect(page.getByText(success ? 'Synchronisation abgeschlossen' : 'Synchronisation fehlgeschlagen.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Synchronisieren', exact: true })).toBeEnabled();
  });
}

test('refreshes the user list after confirmed deletion without another click', async ({ page }) => {
  let deleted = false;
  const users = () => deleted ? [] : [{
    uuid: 'member-uuid', username: 'member', displayName: 'Member', email: null,
    role: 'USER', enabled: true, sourceProvider: 'LOCAL', groupUuids: [],
  }];
  await page.route('**/api/admin/users/page**', (route) => route.fulfill({ json: pageOf(users(), route.request().url()) }));
  await page.route('**/api/admin/users/member-uuid', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    deleted = true;
    await route.fulfill({ status: 204 });
  });
  await page.goto('/admin/users');
  const row = page.getByRole('row').filter({ hasText: 'Member' });
  await expect(row).toBeVisible();
  await row.locator('button.danger').click();
  await page.getByRole('alertdialog').locator('button.primary').click();
  await expect(row).toHaveCount(0);
});
