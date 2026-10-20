import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

const tags = [
  { uuid: 'red', name: 'Atemschutz', color: '#c62828', assetCount: 0 },
  { uuid: 'none', name: 'Ohne Farbe', color: null, assetCount: 0 },
];

async function mockApi(page: Page): Promise<object[]> {
  const saved: object[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/', '');
    if (request.method() === 'POST' && path === 'admin/areas') {
      saved.push(request.postDataJSON());
      return route.fulfill({ json: { uuid: 'neu', ...request.postDataJSON() } });
    }
    const areas = [{ uuid: 'area', name: 'Atemschutz', color: '#b62f2f', defaultArea: true }];
    const body = path === 'auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === 'tags/page' ? pageOf(tags, request.url())
      : path === 'tags' ? tags
      : path === 'admin/areas/page' ? pageOf(areas, request.url())
      : path === 'areas' || path === 'admin/areas' ? areas
      : path === 'customization' ? {} : [];
    await route.fulfill({ json: body });
  });
  return saved;
}

test('a color field without a color has the same size as one with a color', async ({ page }) => {
  await mockApi(page);
  await page.goto('/config/tags');
  const filled = page.locator('.tag-row', { hasText: 'Atemschutz' }).locator('app-color-picker .trigger');
  const empty = page.locator('.tag-row', { hasText: 'Ohne Farbe' }).locator('app-color-picker .trigger');
  await expect(empty).toContainText('Keine Farbe');
  const [a, b] = [(await filled.boundingBox())!, (await empty.boundingBox())!];
  expect(b.width).toBeCloseTo(a.width, 0);
  expect(b.height).toBeCloseTo(a.height, 0);
});

test('areas use the color picker', async ({ page }) => {
  const saved = await mockApi(page);
  await page.goto('/admin/areas');
  await page.getByRole('button', { name: 'Neuer Bereich' }).first().click();
  await page.getByRole('textbox', { name: 'Name *' }).fill('Wasserrettung');
  await page.getByRole('button', { name: 'Farbe: #2563EB' }).click();
  await page.getByRole('dialog', { name: 'Farbe' }).getByTitle('#0F766E').click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({ name: 'Wasserrettung', color: '#0f766e' });
});
