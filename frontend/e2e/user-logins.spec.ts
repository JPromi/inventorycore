import { expect, Page, test } from '@playwright/test';

const user = {
  uuid: 'u1', username: 'gwart', displayName: 'Gerätewart', email: null, role: 'USER', enabled: true,
  sourceProvider: 'LOCAL', groupUuids: [],
};

const entry = (uuid: string, action: string, code: string, params: Record<string, string>, createdAt: string) => ({
  uuid, createdAt, userUuid: action === 'LOGIN_FAILED' ? null : 'u1', userName: action === 'LOGIN_FAILED' ? null : 'Gerätewart',
  action, objectType: 'USER', objectUuid: 'u1', objectName: 'gwart', details: [{ code, params }],
});

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const logins = [
  entry('l3', 'LOGOUT', 'SIGN_OUT', { ip: '203.0.113.7', userAgent: edge }, '2026-10-20T08:30:00Z'),
  entry('l2', 'LOGIN', 'SIGN_IN', { method: 'LDAP', ip: '203.0.113.7', userAgent: edge }, '2026-10-20T07:00:00Z'),
  entry('l1', 'LOGIN_FAILED', 'SIGN_IN_FAILED', { method: 'LDAP', reason: 'BAD_CREDENTIALS', ip: '198.51.100.4', userAgent: iphone }, '2026-10-20T06:59:00Z'),
];

async function mockApi(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/admin/users/u1/logins') {
      requested.push(url.searchParams.toString());
      const pageNumber = Number(url.searchParams.get('page'));
      const items = pageNumber === 0 ? logins.slice(0, 2) : logins.slice(2);
      return route.fulfill({ json: { items, total: 3, page: pageNumber, size: 2 } });
    }
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/admin/users' ? [user]
      : path === '/api/admin/users/u1' ? user
      : path === '/api/audit-logs' ? { items: logins, total: 3, page: 0, size: 50 }
      : path.endsWith('/page') ? { items: [], total: 0, hasMore: false } : [];
    await route.fulfill({ json: body });
  });
  return requested;
}

test('admins see when, how and from where a user signed in', async ({ page }) => {
  const requested = await mockApi(page);
  await page.goto('/admin/users/u1/edit');
  const section = page.locator('app-user-logins');
  await expect(section.getByRole('heading', { name: 'Anmeldungen' })).toBeVisible();
  const items = section.locator('li');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Abgemeldet');
  await expect(items.nth(1)).toContainText('Angemeldet');
  await expect(items.nth(1)).toContainText('LDAP / Active Directory');
  await expect(items.nth(1)).toContainText('203.0.113.7');
  await expect(items.nth(1)).toContainText('Edge 131 · Windows');
  await expect(items.nth(1).getByText('Edge 131 · Windows')).toHaveAttribute('title', edge);

  await section.getByRole('button', { name: 'Ältere anzeigen' }).click();
  await expect(items).toHaveCount(3);
  await expect(items.nth(2)).toContainText('Anmeldung fehlgeschlagen');
  await expect(items.nth(2)).toContainText('Benutzername oder Passwort falsch');
  await expect(items.nth(2)).toContainText('Safari 18 · iOS');
  await expect(section.getByRole('button', { name: 'Ältere anzeigen' })).toHaveCount(0);
  expect(requested).toEqual(['page=0&size=20', 'page=1&size=20']);
});

test('the activity log names sign-ins in words', async ({ page }) => {
  await mockApi(page);
  await page.goto('/admin/logs');
  await expect(page.getByText('Anmeldung fehlgeschlagen').first()).toBeVisible();
  await expect(page.getByText('Benutzername oder Passwort falsch')).toBeVisible();
  await expect(page.getByText('IP-Adresse: 198.51.100.4')).toBeVisible();
  await expect(page.getByText('Browser: Safari 18 · iOS')).toBeVisible();
});
