import { expect, Page, test } from '@playwright/test';

const everyone = { uuid: 'alle', name: 'Alle Benutzer', sourceProvider: 'LOCAL', adminGroup: false, everyone: true, permissions: [] };
const wardens = { uuid: 'gw', name: 'Gerätewarte', sourceProvider: 'LOCAL', adminGroup: false, everyone: false, permissions: [] };
const user = { uuid: 'u1', username: 'gwart', displayName: 'Gerätewart', role: 'USER', enabled: true, sourceProvider: 'LOCAL', groupUuids: ['gw'] };

async function mockApi(page: Page): Promise<{ path: string; body: Record<string, unknown> }[]> {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['POST', 'PATCH'].includes(request.method())) {
      const body = request.postDataJSON();
      writes.push({ path, body });
      return route.fulfill({ json: path.startsWith('/api/admin/groups/alle') && request.method() === 'PATCH' ? { ...everyone, ...body } : { uuid: 'neu', ...body } });
    }
    const json = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/admin/groups' ? [wardens, everyone]
      : path === '/api/admin/users' ? [user]
      : path === '/api/admin/areas' || path === '/api/areas' ? [{ uuid: 'area', name: 'Atemschutz', defaultArea: true }]
      : path.endsWith('/page') ? { items: [], total: 0, hasMore: false } : [];
    await route.fulfill({ json });
  });
  return writes;
}

test('without a group a permission applies to all users', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/admin/group-permissions');
  await page.getByRole('button', { name: 'Berechtigung hinzufügen' }).click();
  const form = page.locator('.add-form');
  // empty means everyone
  await expect(form.locator('app-search-select').first()).toContainText('Alle Benutzer');
  await form.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].path).toBe('/api/admin/groups/alle/permissions');

  // the group of all users comes first in the choice
  await page.getByRole('button', { name: 'Berechtigung hinzufügen' }).click();
  await form.locator('app-search-select').first().locator('.trigger').click();
  await expect(page.getByRole('option').first()).toContainText('Alle Benutzer');
});

test('the group of all users has no members, admin rights or delete button', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/admin/groups/alle/edit');
  await expect(page.locator('input[name="name"]')).toHaveAttribute('readonly', '');
  await expect(page.getByText('Diese Berechtigungen gelten zusätzlich für alle Benutzer.', { exact: false })).toBeVisible();
  await expect(page.locator('input[name="adminGroup"]')).toHaveCount(0);
  await expect(page.locator('app-multi-select[name="members"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page).toHaveURL(/\/admin\/groups$/);
  // only the group itself is saved, no member changes on users
  expect(writes.map((write) => write.path)).toEqual(['/api/admin/groups/alle']);
});

test('users are not added to the group of all users', async ({ page }) => {
  await mockApi(page);
  await page.goto('/admin/users/u1/edit');
  const groups = page.locator('app-multi-select[name="groupUuids"]');
  await groups.locator('input').click();
  await expect(page.getByRole('option', { name: /Alle Benutzer/ })).toHaveCount(0);
});
