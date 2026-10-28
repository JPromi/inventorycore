import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

const me = { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] };
const laptop = {
  uuid: 'laptop', name: 'Laptop', invId: 'EDV-1', serialNumber: 'SN-7', inventoryNumber: null, description: null,
  assetTypeUuid: null, locationUuid: null, tagUuids: [], tags: [], areaUuids: [], images: [], fields: [], fieldValues: [],
};

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const answer = path === '/api/auth/me' ? me
      : path === '/api/scan' ? { code: 'EDV-1', matchedBy: 'CODE', assets: [laptop], locations: [] }
      : path === '/api/assets/page' ? pageOf([laptop], url)
      : path === '/api/assets/laptop' ? laptop
      : [];
    await route.fulfill({ json: answer });
  });
}

test('the back link of an asset leads back to the scanner it was scanned with', async ({ page }) => {
  await mockApi(page);
  await page.goto('/scan');
  const input = page.getByRole('textbox').first();
  await input.fill('EDV-1');
  await input.press('Enter');
  await page.locator('a[href="/assets/laptop"]').first().click();
  await expect(page).toHaveURL(/\/assets\/laptop$/);
  const back = page.getByRole('link', { name: 'Zurück', exact: true });
  await expect(back).toHaveAttribute('href', '/scan');
  await back.click();
  await expect(page).toHaveURL(/\/scan$/);
});

test('the back link of an asset opened from the list leads back to the list', async ({ page }) => {
  await mockApi(page);
  await page.goto('/assets');
  await page.getByText('Laptop', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/assets\/laptop$/);
  await page.getByRole('link', { name: 'Zurück', exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/);
});

test('an asset opened directly falls back to the list', async ({ page }) => {
  await mockApi(page);
  await page.goto('/assets/laptop');
  await page.getByRole('link', { name: 'Zurück', exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/);
});
