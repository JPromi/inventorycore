import { expect, Page, test } from '@playwright/test';

const breathingApparatus = {
  uuid: 'pa', name: 'Pressluftatmer', areaUuids: ['area'], tags: [],
  fieldDefinitions: [
    { name: 'Flaschendruck', fieldKey: 'flaschendruck', fieldType: 'NUMBER', required: false, typeField: true, sortOrder: 0 },
    { name: 'Hersteller', fieldKey: 'hersteller', fieldType: 'SELECT', optionsJson: '["Dräger","MSA","Interspiro"]', required: true, typeField: true, sortOrder: 1 },
    { name: 'Nächste Flaschenprüfung', fieldKey: 'flaschenpruefung', fieldType: 'DATE', required: false, typeField: true, sortOrder: 2 },
    { name: 'Einsatzbereit', fieldKey: 'einsatzbereit', fieldType: 'BOOLEAN', required: false, typeField: true, sortOrder: 3 },
  ],
};

const stored = {
  uuid: 'pa1', name: 'Atemschutzgerät PA 1', invId: 'FW-0042', areaUuids: ['area'], tags: [],
  assetTypeUuid: 'pa',
  fieldValues: [
    { fieldKey: 'flaschendruck', name: 'Flaschendruck', value: '300', customAssetField: false },
    { fieldKey: 'hersteller', name: 'Hersteller', value: 'Dräger', customAssetField: false },
    { fieldKey: 'flaschenpruefung', name: 'Nächste Flaschenprüfung', value: '2027-03-01', customAssetField: false },
    { fieldKey: 'einsatzbereit', name: 'Einsatzbereit', value: 'true', customAssetField: false },
    { fieldKey: 'funkkanal', name: 'Funkkanal', value: '42', customAssetField: true },
  ],
};

/** `typesDelay`: the type list arrives after the asset, as it can on a slow connection. */
async function mockApi(page: Page, typesDelay = 0): Promise<{ path: string; body: Record<string, unknown> }[]> {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['POST', 'PATCH'].includes(request.method())) {
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: { ...stored, ...breathingApparatus, uuid: path.includes('asset-types') ? 'pa' : 'pa1' } });
    }
    if (path === '/api/asset-types') {
      await new Promise((resolve) => setTimeout(resolve, typesDelay));
    }
    const json = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/areas' ? [{ uuid: 'area', name: 'Atemschutz', defaultArea: true }]
      : path === '/api/asset-types' ? [breathingApparatus]
      : path === '/api/asset-types/pa' ? breathingApparatus
      : path === '/api/assets/pa1' ? stored
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json });
  });
  return writes;
}

const fieldRow = (page: Page, index: number) => page.locator('.repeat-row').nth(index);

test('each type field gets the input of its kind and keeps its value when the types arrive late', async ({ page }) => {
  const writes = await mockApi(page, 800);
  await page.goto('/assets/pa1/edit');
  await expect(page.locator('.repeat-row')).toHaveCount(5);
  await expect(fieldRow(page, 0).locator('input[type="number"]')).toHaveValue('300');
  await expect(fieldRow(page, 1).locator('app-search-select')).toContainText('Dräger');
  await expect(fieldRow(page, 1)).toContainText('*');
  await expect(fieldRow(page, 2).locator('input[type="date"]')).toHaveValue('2027-03-01');
  await expect(fieldRow(page, 3).locator('input[type="checkbox"]')).toBeChecked();
  await expect(fieldRow(page, 4).locator('input[type="text"]').last()).toHaveValue('42');

  // change every kind
  await fieldRow(page, 0).locator('input[type="number"]').fill('280');
  await fieldRow(page, 1).locator('app-search-select .trigger').click();
  await expect(fieldRow(page, 1).locator('.panel').getByRole('option')).toHaveText(['Dräger', 'MSA', 'Interspiro']);
  await page.getByRole('option', { name: 'MSA', exact: true }).click();
  await fieldRow(page, 2).locator('input[type="date"]').fill('2028-01-15');
  await fieldRow(page, 3).locator('input[type="checkbox"]').uncheck();

  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body['fieldValues']).toEqual([
    expect.objectContaining({ fieldKey: 'flaschendruck', value: '280' }),
    expect.objectContaining({ fieldKey: 'hersteller', value: 'MSA' }),
    expect.objectContaining({ fieldKey: 'flaschenpruefung', value: '2028-01-15' }),
    expect.objectContaining({ fieldKey: 'einsatzbereit', value: 'false' }),
    expect.objectContaining({ fieldKey: 'funkkanal', value: '42', customAssetField: true }),
  ]);
});

test('a new asset sends the values of its type fields', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/assets/new');
  await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill('Atemschutzgerät PA 2');
  await page.getByRole('button', { name: 'Typ', exact: true }).click();
  await page.getByRole('option', { name: /Pressluftatmer/ }).click();
  await expect(page.locator('.repeat-row')).toHaveCount(4);
  await fieldRow(page, 0).locator('input[type="number"]').fill('300');
  await fieldRow(page, 1).locator('app-search-select .trigger').click();
  await page.getByRole('option', { name: 'Interspiro', exact: true }).click();
  await fieldRow(page, 3).locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body['fieldValues']).toEqual([
    expect.objectContaining({ fieldKey: 'flaschendruck', value: '300' }),
    expect.objectContaining({ fieldKey: 'hersteller', value: 'Interspiro' }),
    expect.objectContaining({ fieldKey: 'flaschenpruefung', value: '' }),
    expect.objectContaining({ fieldKey: 'einsatzbereit', value: 'true' }),
  ]);
});

test('removing the type on purpose still drops its fields', async ({ page }) => {
  await mockApi(page);
  await page.goto('/assets/pa1/edit');
  await expect(page.locator('.repeat-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'Typ', exact: true }).click();
  await page.getByRole('button', { name: 'Kein Typ', exact: true }).click();
  // only the own field stays
  await expect(page.locator('.repeat-row')).toHaveCount(1);
  await expect(fieldRow(page, 0).locator('input[type="text"]').last()).toHaveValue('42');
});

test('the type configuration uses the shared dropdown and asks for choices', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/config/types/new');
  await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill('Leitern');
  await page.getByRole('button', { name: 'Feld hinzufügen', exact: true }).click();
  const field = fieldRow(page, 0);
  await field.locator('input[type="text"]').first().fill('Bauart');
  await field.locator('app-search-select .trigger').click();
  await page.getByRole('option', { name: 'Auswahl', exact: true }).click();

  // a selection field without choices is not saved
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  await expect(page.getByText('Bitte mindestens einen Auswahlwert für „Bauart“ angeben.')).toBeVisible();
  expect(writes).toHaveLength(0);

  await field.getByRole('textbox', { name: 'Auswahlwerte' }).fill('Steckleiter, Schiebleiter; Klappleiter');
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body['fieldDefinitions']).toEqual([
    expect.objectContaining({ name: 'Bauart', fieldType: 'SELECT', optionsJson: '["Steckleiter","Schiebleiter","Klappleiter"]' }),
  ]);
});

test('type fields and own asset fields can be reordered', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/config/types/pa/edit');
  await expect(page.locator('.repeat-row')).toHaveCount(4);
  await expect(fieldRow(page, 0).getByRole('button', { name: 'Feld nach oben' })).toBeDisabled();
  await fieldRow(page, 3).getByRole('button', { name: 'Feld nach oben' }).click();
  await fieldRow(page, 0).getByRole('button', { name: 'Feld nach unten' }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(
    (writes[0].body['fieldDefinitions'] as { name: string; sortOrder: number }[]).map((field) => [field.name, field.sortOrder]),
  ).toEqual([['Hersteller', 0], ['Flaschendruck', 1], ['Einsatzbereit', 2], ['Nächste Flaschenprüfung', 3]]);
});

test('an asset orders its own fields below the type fields', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/assets/pa1/edit');
  await expect(page.locator('.repeat-row')).toHaveCount(5);
  // type fields keep the order of their type
  await expect(fieldRow(page, 0).getByRole('button', { name: 'Feld nach unten' })).toBeHidden();
  await page.getByRole('button', { name: 'Feld hinzufügen', exact: true }).click();
  await fieldRow(page, 5).locator('input[type="text"]').first().fill('Standort im Fahrzeug');
  await expect(fieldRow(page, 4).getByRole('button', { name: 'Feld nach oben' })).toBeDisabled();
  await fieldRow(page, 5).getByRole('button', { name: 'Feld nach oben' }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect((writes[0].body['fieldValues'] as { name: string }[]).map((field) => field.name).slice(4)).toEqual([
    'Standort im Fahrzeug',
    'Funkkanal',
  ]);
});
