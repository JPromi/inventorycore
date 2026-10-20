import { expect, Page, test } from '@playwright/test';

async function setup(page: Page) {
  const permission = {
    uuid: 'permission',
    resourceType: 'ASSET',
    areaUuid: 'area',
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canInspect: false,
    admin: false,
  };
  const group = {
    uuid: 'group',
    name: 'Mitglieder',
    sourceProvider: 'LOCAL',
    adminGroup: false,
    permissions: [permission],
    members: [],
  };
  const writes: { path: string; body: any }[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (['POST', 'PATCH'].includes(route.request().method())) {
      const body = route.request().postDataJSON();
      writes.push({ path, body });
      return route.fulfill({ json: { uuid: 'saved', ...body } });
    }
    return route.fulfill({
      json:
        path === '/api/auth/me'
          ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
          : path === '/api/admin/groups'
            ? [group]
            : path === '/api/admin/areas' || path === '/api/areas'
              ? [{ uuid: 'area', name: 'Feuerwehr', defaultArea: true }]
              : path.endsWith('/page')
                ? { items: [], total: 0, hasMore: false }
                : [],
    });
  });
  return writes;
}

for (const width of [1280, 390]) {
  test(`permissions use shared dropdowns and preserve immediate updates (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const writes = await setup(page);
    await page.goto('/admin/group-permissions');
    const preset = page.getByRole('button', { name: 'Vorlage anwenden', exact: true });
    await preset.click();
    const panel = page.locator('app-search-select .panel');
    expect(await panel.evaluate((element) => element.matches(':popover-open'))).toBe(true);
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.getByRole('option', { name: 'Vollzugriff', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].body).toMatchObject({
      canView: true,
      canEdit: true,
      canInspect: true,
      admin: false,
    });
    await expect(preset).toContainText('Anwenden');
    await preset.click();
    await page.getByRole('option', { name: 'Nur ansehen', exact: true }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].body.canInspect).toBe(false);
    await page.locator('.header-actions button').click();
    const rights = page.getByRole('button', { name: 'Rechte', exact: true });
    await rights.click();
    await page.getByRole('option', { name: 'Ansehen & bearbeiten', exact: true }).click();
    await expect(rights).toContainText('Ansehen & bearbeiten');
    await page.locator('.add-grid app-search-select').first().locator('.trigger').click();
    await page.getByRole('option', { name: 'Mitglieder', exact: true }).click();
    await page.locator('.add-form .editor-actions .primary-action').click();
    await expect.poll(() => writes.length).toBe(3);
    expect(writes[2].body).toMatchObject({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
    });
  });

  test(`group rights dropdowns keep changes local until saving (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const writes = await setup(page);
    await page.goto('/admin/groups/group/edit');
    const rights = page.getByRole('button', { name: 'Rechte', exact: true });
    await rights.click();
    await page.getByRole('option', { name: 'Admin', exact: true }).click();
    await expect(rights).toContainText('Admin');
    const preset = page.getByRole('button', { name: 'Vorlage anwenden', exact: true });
    await preset.click();
    await page.getByRole('option', { name: 'Ansehen & bearbeiten', exact: true }).click();
    await expect(page.locator('.permission-table input[type="checkbox"]').nth(2)).toBeChecked();
    await expect(preset).toContainText('Anwenden');
    expect(writes).toHaveLength(0);
    await page.screenshot({ path: test.info().outputPath('group-dropdowns.png') });
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].body.permissions[0]).toMatchObject({
      canView: true,
      canCreate: true,
      canEdit: true,
      admin: false,
    });
  });
}
