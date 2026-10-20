import { expect, Page, test } from '@playwright/test';

const breathingApparatus = {
  uuid: 'pa', name: 'Pressluftatmer', areaUuids: ['area'], tags: [],
  fieldDefinitions: [
    { name: 'Flaschendruck', fieldKey: 'flaschendruck', fieldType: 'NUMBER', required: false, typeField: true, sortOrder: 0 },
    { name: 'Hersteller', fieldKey: 'hersteller', fieldType: 'TEXT', required: false, typeField: true, sortOrder: 1 },
  ],
};

const stored = {
  uuid: 'pa1', name: 'Atemschutzgerät PA 1', invId: 'FW-0042', areaUuids: ['area'], tags: [],
  assetTypeUuid: 'pa',
  fieldValues: [
    { fieldKey: 'flaschendruck', name: 'Flaschendruck', value: '300', customAssetField: false },
    { fieldKey: 'hersteller', name: 'Hersteller', value: 'Dräger', customAssetField: false },
    { fieldKey: 'funkkanal', name: 'Funkkanal', value: '42', customAssetField: true },
  ],
};

/** `typesDelay`: the type list arrives after the asset, as it can on a slow connection. */
async function mockApi(page: Page, typesDelay = 0): Promise<Record<string, unknown>[]> {
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['POST', 'PATCH'].includes(request.method()) && path.startsWith('/api/assets')) {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { ...stored, uuid: 'pa1' } });
    }
    if (path === '/api/asset-types') {
      await new Promise((resolve) => setTimeout(resolve, typesDelay));
    }
    const json = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/areas' ? [{ uuid: 'area', name: 'Atemschutz', defaultArea: true }]
      : path === '/api/asset-types' ? [breathingApparatus]
      : path === '/api/assets/pa1' ? stored
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json });
  });
  return writes;
}

const valueInputs = (page: Page) => page.getByRole('textbox', { name: 'Wert', exact: true });

async function expectValues(page: Page, values: string[]) {
  await expect(valueInputs(page)).toHaveCount(values.length);
  for (const [index, value] of values.entries()) {
    await expect(valueInputs(page).nth(index)).toHaveValue(value);
  }
}

test('editing keeps the values of the type fields when the types arrive late', async ({ page }) => {
  const writes = await mockApi(page, 800);
  await page.goto('/assets/pa1/edit');
  await expect(page.getByRole('textbox', { name: 'Name', exact: true }).first()).toHaveValue('Atemschutzgerät PA 1');
  // the types arrived after the asset: the values must still be there
  await expectValues(page, ['300', 'Dräger', '42']);

  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]['fieldValues']).toEqual([
    expect.objectContaining({ fieldKey: 'flaschendruck', value: '300', customAssetField: false }),
    expect.objectContaining({ fieldKey: 'hersteller', value: 'Dräger', customAssetField: false }),
    expect.objectContaining({ fieldKey: 'funkkanal', value: '42', customAssetField: true }),
  ]);
});

test('a new asset sends the values of its type fields', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/assets/new');
  await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill('Atemschutzgerät PA 2');
  await page.getByRole('button', { name: 'Typ', exact: true }).click();
  await page.getByRole('option', { name: /Pressluftatmer/ }).click();
  await expect(valueInputs(page)).toHaveCount(2);
  await valueInputs(page).nth(0).fill('300');
  await valueInputs(page).nth(1).fill('MSA');
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]['fieldValues']).toEqual([
    expect.objectContaining({ fieldKey: 'flaschendruck', value: '300' }),
    expect.objectContaining({ fieldKey: 'hersteller', value: 'MSA' }),
  ]);
});

test('removing the type on purpose still drops its fields', async ({ page }) => {
  await mockApi(page);
  await page.goto('/assets/pa1/edit');
  await expect(valueInputs(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Typ', exact: true }).click();
  await page.getByRole('button', { name: 'Kein Typ', exact: true }).click();
  // only the own field stays
  await expectValues(page, ['42']);
});
