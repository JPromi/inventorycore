import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

async function setup(page: Page, selection: string[] = []) {
  await page.addInitScript((selected) => {
    localStorage.setItem('inventorycore.selectedAreas', JSON.stringify(selected));
  }, selection);
  const tags = [
    { uuid: 'computer', name: 'Computer', color: '#123456', areaUuid: 'edv', assetCount: 1, assetTypeCount: 0 },
    { uuid: 'mask', name: 'Maske', color: '#654321', areaUuid: 'atemschutz', assetCount: 1, assetTypeCount: 0 },
  ];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/', '');
    if (request.method() === 'PATCH' || request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return route.fulfill({ json: { uuid: path.split('/')[1] ?? 'created', ...body } });
    }
    const selected = url.searchParams.getAll('areas');
    const json = path === 'auth/me'
      ? { authenticated: true, username: 'edv-admin', role: 'USER', permissions: [
          { areaUuid: 'edv', resourceType: null, admin: true },
          { areaUuid: 'atemschutz', resourceType: null, canView: true },
        ] }
      : path === 'areas'
        ? [{ uuid: 'edv', name: 'EDV', defaultArea: true }, { uuid: 'atemschutz', name: 'Atemschutz', defaultArea: false }]
        : path === 'tags/page'
          ? pageOf(tags.filter((tag) => !selected.length || selected.includes(tag.areaUuid)), url)
          : path === 'tags' ? tags : path === 'customization' ? {} : [];
    return route.fulfill({ json });
  });
  return writes;
}

test('area admins can recolor their own tags while foreign tag controls stay disabled', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/config/tags');
  const own = page.locator('.tag-row').filter({ has: page.getByRole('textbox', { name: 'Name von Computer' }) });
  const foreign = page.locator('.tag-row').filter({ has: page.getByRole('textbox', { name: 'Name von Maske' }) });
  await expect(own.locator('app-color-picker button.trigger')).toBeEnabled();
  await expect(foreign.locator('app-color-picker button.trigger')).toBeDisabled();
  await expect(foreign.getByRole('textbox')).toBeDisabled();
  await own.locator('app-color-picker button.trigger').click();
  await page.locator('app-color-picker .presets button.preset:not(.none)').first().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ path: 'tags/computer', body: { name: 'Computer', areaUuid: 'edv' } });
  await expect(own).toContainText('Gespeichert');
});

test('sidebar area changes reload tags and remove creation in a read-only area', async ({ page }) => {
  await setup(page, ['edv']);
  await page.goto('/config/tags');
  await expect(page.locator('.tag-row')).toHaveCount(1);
  await expect(page.locator('.tag-row')).toContainText('Computer');
  const switcher = page.locator('app-area-switcher');
  await switcher.locator('.trigger').click();
  await switcher.getByRole('button', { name: 'EDV', exact: true }).click();
  await switcher.getByRole('button', { name: 'Atemschutz', exact: true }).click();
  await expect(page.locator('.tag-row')).toHaveCount(1);
  await expect(page.locator('.tag-row')).toContainText('Maske');
  await expect(page.locator('form.create-row')).toHaveCount(0);
});

test('creating a tag explicitly sends its owning area', async ({ page }) => {
  const writes = await setup(page, ['edv']);
  await page.goto('/config/tags');
  await page.locator('input[name="newName"]').fill('Notebook');
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ path: 'tags', body: { name: 'Notebook', areaUuid: 'edv' } });
  await expect(page.getByRole('textbox', { name: 'Name von Notebook' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/tag-areas-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
