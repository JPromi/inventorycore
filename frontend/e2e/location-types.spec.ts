import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

const locations = [
  { uuid: 'hq', name: 'Zentrale', locationType: 'BUILDING', images: [], areaUuids: ['area'] },
  { uuid: 'shelf', name: 'Regal A', locationType: 'SHELF', parentLocationUuid: 'hq', images: [], areaUuids: ['area'] },
  { uuid: 'van', name: 'Servicebus', locationType: 'VEHICLE', images: [], areaUuids: ['area'] },
  // older locations without a type
  { uuid: 'old', name: 'Altbestand', images: [], areaUuids: ['area'] },
];

async function setup(page: Page) {
  const saved: Record<string, unknown>[] = [];
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 404 }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/locations') {
      const body = request.postDataJSON();
      saved.push(body);
      return route.fulfill({ json: { ...body, uuid: 'new', images: [], areaUuids: ['area'] } });
    }
    const location = locations.find(entry => path === `/api/locations/${entry.uuid}`);
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
      : location ? location
      : path === '/api/locations' ? locations
      : path === '/api/locations/page' ? pageOf(locations, request.url())
      : path === '/api/areas' ? [{ uuid: 'area', name: 'EDV', defaultArea: true }]
      : path === '/api/customization' ? {} : [];
    return route.fulfill({ json: body });
  });
  return { saved };
}

test('the type is chosen in the form, changes the icon and is saved', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/locations/new');
  const headerIcon = page.locator('.page-header h1 svg').first();
  await expect(headerIcon).toHaveClass(/lucide-map-pin/);
  const field = page.locator('label', { hasText: 'Art' });
  await expect(field.locator('.trigger')).toContainText('Anderes');
  await field.locator('.trigger').click();
  await field.getByRole('option', { name: /^Fahrzeug/ }).click();
  await expect(headerIcon).toHaveClass(/lucide-truck/);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Servicebus 2');
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0]).toMatchObject({ name: 'Servicebus 2', locationType: 'VEHICLE' });
});

test('the list and the location view show the icon and name of the type', async ({ page }) => {
  await setup(page);
  await page.goto('/locations');
  const row = (name: string) => page.locator('article.item', { has: page.locator('strong', { hasText: new RegExp(`^\\s*${name}\\s*$`) }) });
  await expect(row('Zentrale').locator('.thumb svg')).toHaveClass(/lucide-building/);
  await expect(row('Regal A').locator('.thumb svg')).toHaveClass(/lucide-library-big/);
  await expect(row('Regal A').locator('.meta')).toContainText('Regal · in Zentrale');
  await expect(row('Servicebus').locator('.thumb svg')).toHaveClass(/lucide-truck/);
  await expect(row('Altbestand').locator('.thumb svg')).toHaveClass(/lucide-map-pin/);

  await page.goto('/locations/van');
  await expect(page.locator('.title-icon svg')).toHaveClass(/lucide-truck/);
  await expect(page.locator('.details')).toContainText('ArtFahrzeug');
  await expect(page.locator('.no-image svg')).toHaveClass(/lucide-truck/);
});
