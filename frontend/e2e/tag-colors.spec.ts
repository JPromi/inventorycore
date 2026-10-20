import { expect, Page, test } from '@playwright/test';

/** The palette of the color picker (PRESET_COLORS). */
const PALETTE = [
  '#b62f2f', '#e11d48', '#db2777', '#c026d3', '#7c3aed', '#4f46e5', '#2563eb', '#0284c7', '#0891b2',
  '#0f766e', '#15803d', '#65a30d', '#ca8a04', '#d97706', '#ea580c', '#78716c', '#475569', '#1f2937',
];

async function mockApi(page: Page): Promise<Record<string, unknown>[]> {
  const created: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/tags' && request.method() === 'POST') {
      const body = request.postDataJSON();
      created.push(body);
      return route.fulfill({ status: 201, json: { uuid: `tag-${created.length}`, ...body } });
    }
    const json = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/areas' ? [{ uuid: 'area', name: 'Atemschutz', defaultArea: true }]
      : path.endsWith('/page') ? { items: [], total: 0, page: 0, size: 50, hasMore: false }
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json });
  });
  return created;
}

test('a new tag starts with a color of the palette', async ({ page }) => {
  const created = await mockApi(page);
  await page.goto('/config/tags');
  const create = page.locator('form.create-row');
  await expect(create.locator('app-color-picker .trigger')).not.toContainText('Keine Farbe');
  await create.locator('input.name-input').fill('Atemschutz');
  await create.getByRole('button', { name: 'Anlegen' }).click();
  await expect(create.locator('input.name-input')).toHaveValue('');
  await create.locator('input.name-input').fill('Hydraulik');
  await create.getByRole('button', { name: 'Anlegen' }).click();
  await expect.poll(() => created.length).toBe(2);
  for (const tag of created) {
    expect(PALETTE).toContain(tag['color']);
  }
});

test('a tag created in the asset form also gets a color', async ({ page }) => {
  const created = await mockApi(page);
  await page.goto('/assets/new');
  const tags = page.locator('app-multi-select[name="tags"]');
  await tags.locator('input').fill('Wasserrettung');
  await page.getByText('„Wasserrettung“ erstellen').click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]['name']).toBe('Wasserrettung');
  expect(PALETTE).toContain(created[0]['color']);
});
