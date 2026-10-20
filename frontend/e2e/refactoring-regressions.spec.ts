import { expect, test } from '@playwright/test';

test('dashboard links and the brand open the dashboard instead of the wildcard', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === '/api/auth/me'
          ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
          : new URL(route.request().url()).pathname === '/api/dashboard'
            ? { assetCount: 0, locationCount: 0, assetTypeCount: 0, tagCount: 0, canInspect: false,
                due: { overdue: 0, dueSoon: 0, ok: 0 }, nextDue: [], openInspectionCount: 0, completedInspectionCount: 0,
                recentInspections: [], results: { ok: 0, defect: 0, missing: 0, failed: 0 }, topTags: [], assetsByType: [],
                otherTypeAssetCount: 0 }
            : new URL(route.request().url()).pathname.endsWith('/page')
              ? { items: [], total: 0, hasMore: false }
              : [],
    }),
  );
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/assets');
  await page.locator('.brand').click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('late responses cannot overwrite a newer linked asset detail', async ({ page }) => {
  const child = { uuid: 'child', name: 'Atemschutzgerät', parentAssetUuid: 'parent' };
  const parent = { uuid: 'parent', name: 'Fahrzeug' };
  let parentRequested = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/assets/parent') {
      parentRequested = true;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await route.fulfill({
      json:
        path === '/api/auth/me'
          ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
          : path === '/api/assets'
            ? [parent, child]
            : path === '/api/assets/parent'
              ? parent
              : path === '/api/assets/child'
                ? child
                : [],
    });
  });
  await page.goto('/assets/child');
  await page.getByRole('link', { name: 'Fahrzeug', exact: true }).first().click();
  await expect.poll(() => parentRequested).toBe(true);
  await page.goBack();
  await expect(page.locator('.page-header h1')).toHaveText(child.name);
  await page.waitForTimeout(800);
  await expect(page.locator('.page-header h1')).toHaveText(child.name);
});

test('group retry keeps the created UUID and already saved memberships', async ({ page }) => {
  let creations = 0;
  const updates: string[] = [];
  let failed = false;
  const users = ['a', 'b'].map((uuid) => ({
    uuid,
    username: uuid,
    displayName: uuid,
    role: 'USER',
    enabled: true,
    groupUuids: [],
    sourceProvider: 'LOCAL',
  }));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/admin/groups' && method === 'POST') creations++;
    if (path.startsWith('/api/admin/users/') && method === 'PATCH') {
      const uuid = path.split('/').at(-1)!;
      updates.push(uuid);
      if (uuid === 'b' && !failed) {
        failed = true;
        return route.fulfill({ status: 500, json: {} });
      }
    }
    await route.fulfill({
      json:
        path === '/api/auth/me'
          ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
          : path === '/api/admin/users'
            ? users
            : (path === '/api/admin/groups' && method === 'POST') ||
                path === '/api/admin/groups/group'
              ? { uuid: 'group', name: 'Einsatzkräfte', permissions: [] }
              : path.endsWith('/page')
                ? { items: [], total: 0, hasMore: false }
                : [],
    });
  });
  await page.goto('/admin/groups/new');
  await page.locator('input[name="name"]').fill('Einsatzkräfte');
  for (const uuid of ['a', 'b']) {
    await page.locator('app-multi-select[name="members"] input').focus();
    await page.getByRole('option', { name: new RegExp('^' + uuid) }).click();
  }
  const save = page.getByRole('button', { name: 'Speichern', exact: true });
  await save.click();
  await expect(page.locator('.error')).toBeVisible();
  await save.click();
  await expect(page).toHaveURL(/\/admin\/groups$/);
  expect(creations).toBe(1);
  expect(updates).toEqual(['a', 'b', 'b']);
});
