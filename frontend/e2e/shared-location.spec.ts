import { expect, test } from '@playwright/test';

test('a location used by several areas is marked as shared', async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  let storeRoom: Record<string, unknown> = {
    uuid: 'lager', name: 'Lager Test', locationType: 'OTHER', areaUuids: ['edv', 'zeug'], shared: false,
    childLocationUuids: [], assetUuids: [], images: [],
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/locations/lager' && request.method() === 'PATCH') {
      saved = request.postDataJSON();
      storeRoom = { ...storeRoom, ...saved };
      return route.fulfill({ json: storeRoom });
    }
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/areas' ? [{ uuid: 'edv', name: 'EDV', defaultArea: true }, { uuid: 'zeug', name: 'Zeugmeister', defaultArea: false }]
      : path === '/api/locations' ? [storeRoom]
      : path === '/api/locations/lager' ? storeRoom
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json: body });
  });

  await page.goto('/locations/lager/edit');
  const toggle = page.getByRole('checkbox', { name: /Gemeinsamer Standort/ });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('Jeder Bereich sieht hier nur seine eigenen Assets und Unterstandorte.', { exact: false })).toBeVisible();
  await toggle.check();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/locations\/lager$/);
  expect(saved).toMatchObject({ shared: true });
  await expect(page.locator('dt', { hasText: 'Gemeinsamer Standort' })).toBeVisible();
});
