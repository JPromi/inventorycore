import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

async function setup(
  page: Page,
  endpoint = 'assets',
  options: {
    failOnce?: string;
    editable?: boolean;
    loadFail?: boolean;
    extraTypes?: Record<string, unknown>[];
  } = {},
) {
  const tag = { uuid: 'tag', name: 'Atemschutz' };
  const definition = {
    fieldKey: 'manufacturer',
    name: 'Hersteller',
    fieldType: 'TEXT',
    required: false,
    typeField: false,
    sortOrder: 0,
  };
  const type = {
    uuid: 'type',
    name: 'Pressluftatmer',
    fieldDefinitions: [definition],
    tags: [tag],
    areaUuids: ['area'],
  };
  const location = {
    uuid: 'location',
    name: 'Fahrzeughalle',
    areaUuids: ['area'],
    locationType: 'ROOM',
  };
  const entries: Record<string, unknown>[] = Array.from({ length: 3 }, (_, index) => ({
    uuid: 'id-' + index,
    name: 'Gerät ' + (index + 1),
    description: 'Alte Beschreibung',
    invId: 'FW-' + index,
    serialNumber: '00' + index,
    inventoryNumber: 'INV-' + index,
    areaUuids: ['area'],
    assetTypeUuid: 'type',
    locationUuid: 'location',
    parentAssetUuid: 'parent',
    parentAssetNote: 'Im Gerätesatz',
    inspectionPolicy: 'MANUAL',
    fieldValues: [
      { fieldKey: 'manufacturer', name: 'Hersteller', value: 'Beispiel', customAssetField: false },
      { fieldKey: 'note', name: 'Eigene Notiz', value: 'Erhalten', customAssetField: true },
    ],
    fieldDefinitions: [definition],
    tags: [tag, { uuid: 'direct', name: 'Direkt' }],
    images: [{ kind: 'THUMBNAIL', fileUuid: 'photo', url: '/api/files/photo', sortOrder: 0 }],
    locationType: 'ROOM',
    street: 'Feuerwehrstraße 1',
    postalCode: '1010',
    city: 'Wien',
    country: 'Österreich',
    latitude: 48.2,
    longitude: 16.3,
    shared: true,
    parentLocationUuid: 'location',
    inspectionIntervalDays: 30,
  }));
  const writes: { method: string; uuid: string; body: Record<string, unknown> }[] = [];
  const gets = new Map<string, number>();
  let failed = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/', '');
    if (
      (path === endpoint && request.method() === 'POST') ||
      (path.startsWith(endpoint + '/') && request.method() === 'PATCH')
    ) {
      const uuid = path === endpoint ? 'new-' + writes.length : path.split('/').at(-1)!;
      const body = request.postDataJSON();
      writes.push({ method: request.method(), uuid, body });
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (!failed && (body.name === options.failOnce || uuid === options.failOnce)) {
        failed = true;
        return route.fulfill({ status: 409, json: {} });
      }
      return route.fulfill({ json: { ...body, uuid } });
    }
    if (path.startsWith(endpoint + '/') && !path.endsWith('/page')) {
      const uuid = path.split('/').at(-1)!;
      const count = (gets.get(uuid) ?? 0) + 1;
      gets.set(uuid, count);
      if (options.loadFail) return route.fulfill({ status: 500, json: {} });
      const entry = entries.find((item) => item['uuid'] === uuid);
      return route.fulfill({
        json: {
          ...entry,
          description: count > 1 ? 'Parallel aktualisiert' : entry?.['description'],
        },
      });
    }
    const json =
      path === 'auth/me'
        ? {
            authenticated: true,
            username: 'operator',
            role: options.editable === false ? 'USER' : 'ADMIN',
            permissions: [
              {
                resourceType: 'ASSET',
                areaUuid: 'area',
                canView: true,
                canCreate: false,
                canEdit: false,
                canDelete: false,
              },
            ],
          }
        : path === endpoint + '/page'
          ? pageOf(entries, request.url())
          : path === endpoint
            ? entries
            : path === 'asset-types'
              ? [type, ...(options.extraTypes ?? [])]
              : path === 'locations'
                ? [location]
                : path === 'tags'
                  ? [tag, { uuid: 'direct', name: 'Direkt' }]
                  : path === 'areas'
                    ? [{ uuid: 'area', name: 'Feuerwehr', defaultArea: true }]
                    : path === 'customization'
                      ? {}
                      : [];
    return route.fulfill({ json });
  });
  return { writes, entries };
}

const cell = (page: Page, row: number, field: string) =>
  page.getByRole('textbox', { name: `Zeile ${row}: ${field}`, exact: true });
const select = (page: Page, row: number, field: string) =>
  page.getByRole('button', { name: `Zeile ${row}: ${field}`, exact: true });

async function choose(page: Page, row: number, field: string, label: string) {
  await select(page, row, field).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function createTable(page: Page) {
  await page.getByRole('button', { name: 'Weitere Optionen zum Erstellen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mehrere erstellen', exact: true }).click();
}

async function editSelection(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Alle geladenen auswählen', exact: true }).check();
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'In Tabelle bearbeiten', exact: true }).click();
  await expect(cell(page, 1, 'Name')).toBeVisible();
}

async function paste(page: Page, row: number, field: string, text: string) {
  await cell(page, row, field).evaluate((element, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }),
    );
  }, text);
}

test('creates ten assets with real drag-fill and keyboard fill for lookup columns', async ({
  page,
}) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/assets');
  await createTable(page);
  await expect(cell(page, 10, 'Name')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Inventar-ID/ })).toHaveCount(0);
  await cell(page, 1, 'Name').fill('Funkgerät');
  const handle = page.getByRole('button', { name: 'Wert nach unten ziehen und kopieren' });
  const start = await handle.boundingBox();
  const end = await cell(page, 10, 'Name').boundingBox();
  const sheet = await page.locator('dialog .sheet').boundingBox();
  await page.mouse.move(start!.x + 3, start!.y + 3);
  await page.mouse.down();
  await page.mouse.move(
    end!.x + 40,
    Math.min(end!.y + end!.height / 2, sheet!.y + sheet!.height - 8),
    { steps: 15 },
  );
  await expect(page.locator('td[data-row="9"][data-col="0"]')).toHaveClass(/selected/);
  await page.mouse.up();
  await expect(cell(page, 10, 'Name')).toHaveValue('Funkgerät');
  await choose(page, 1, 'Typ', 'Pressluftatmer');
  await select(page, 1, 'Typ').press('Shift+ArrowDown');
  for (let i = 0; i < 8; i++) await select(page, 1, 'Typ').press('Shift+ArrowDown');
  await select(page, 1, 'Typ').press('Control+d');
  await expect(select(page, 10, 'Typ')).toContainText('Pressluftatmer');
  await page.getByRole('dialog').screenshot({ path: 'test-results/inventory-table.png' });
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('10 gespeichert');
  expect(state.writes).toHaveLength(10);
  for (const write of state.writes) expect(write.body).not.toHaveProperty('invId');
  for (const write of state.writes)
    expect(write.body).toMatchObject({
      name: 'Funkgerät',
      assetTypeUuid: 'type',
      areaUuids: ['area'],
      tagUuids: [],
    });
});

test('pastes quoted Excel cells, retains leading zeros, retries failed creates without duplicates', async ({
  page,
}) => {
  const state = await setup(page, 'assets', { failOnce: 'Zweites Gerät' });
  await page.goto('/assets');
  await createTable(page);
  await expect(cell(page, 1, 'Name')).toBeVisible();
  await paste(
    page,
    1,
    'Name',
    'Erstes Gerät\t"Text mit\nZeilenumbruch"\t00123\r\nZweites Gerät\t"Text mit ""Zitat"""\t00456\r\n',
  );
  await expect(cell(page, 1, 'Seriennummer')).toHaveValue('00123');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 gespeichert');
  await expect(page.getByRole('alert')).toContainText('Speicherkonflikt');
  expect(state.writes[0].body['description']).toBe('Text mit\nZeilenumbruch');
  expect(state.writes[1].body['description']).toBe('Text mit "Zitat"');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 gespeichert');
  expect(state.writes).toHaveLength(3);
  expect(state.writes.filter((write) => write.body['name'] === 'Erstes Gerät')).toHaveLength(1);
});

test('editing preserves fresh unrelated data, inherited tags, photos and relationships', async ({
  page,
}) => {
  const state = await setup(page);
  await page.route('**/api/assets/id-0', async (route) => {
    if (route.request().method() === 'GET')
      await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fallback();
  });
  await editSelection(page, '/assets');
  await expect(cell(page, 1, 'Name')).toHaveValue('Gerät 1');
  await expect(cell(page, 3, 'Name')).toHaveValue('Gerät 3');
  await cell(page, 1, 'Name').fill('Neuer Name');
  await cell(page, 3, 'Name').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Nach unten ausfüllen', exact: true }).click();
  await expect(cell(page, 2, 'Name')).toHaveValue('Neuer Name');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(cell(page, 2, 'Name')).toHaveValue('Gerät 2');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 gespeichert');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toMatchObject({
    invId: 'FW-0',
    name: 'Neuer Name',
    description: 'Parallel aktualisiert',
    parentAssetUuid: 'parent',
    parentAssetNote: 'Im Gerätesatz',
    inspectionPolicy: 'MANUAL',
    tagUuids: ['direct'],
    images: [{ fileUuid: 'photo' }],
    fieldValues: [{ value: 'Beispiel' }, { value: 'Erhalten' }],
    statusUuid: null,
  });
});

test('discard prompt protects unsaved entries and repeated Escape does not discard', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/assets');
  await createTable(page);
  await cell(page, 1, 'Name').fill('Noch nicht gespeichert');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Änderungen verwerfen', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Mehrere erstellen' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(cell(page, 1, 'Name')).toHaveValue('Noch nicht gespeichert');
});

test('locations and types retain fields not displayed in the table', async ({ page }) => {
  for (const [endpoint, path] of [
    ['locations', '/locations'],
    ['asset-types', '/config/types'],
  ]) {
    await page.unroute('**/api/**');
    const state = await setup(page, endpoint);
    await editSelection(page, path);
    await cell(page, 1, 'Name').fill('Umbenannt');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('1 gespeichert');
    expect(state.writes[0].body['images']).toEqual(
      expect.arrayContaining([expect.objectContaining({ fileUuid: 'photo' })]),
    );
    if (endpoint === 'locations')
      expect(state.writes[0].body).toMatchObject({
        shared: true,
        latitude: 48.2,
        longitude: 16.3,
        parentLocationUuid: 'location',
      });
    else
      expect(state.writes[0].body).toMatchObject({
        fieldDefinitions: [expect.objectContaining({ fieldKey: 'manufacturer' })],
      });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Schließen', exact: true })
      .last()
      .click();
  }
});

test('load failure prevents editing and submitting incomplete replacement data', async ({
  page,
}) => {
  const state = await setup(page, 'assets', { loadFail: true });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Alle geladenen auswählen', exact: true }).check();
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'In Tabelle bearbeiten', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(
    0,
  );
  expect(state.writes).toHaveLength(0);
});

test('read-only users cannot open creation or bulk editing', async ({ page }) => {
  await setup(page, 'assets', { editable: false });
  await page.goto('/assets');
  await expect(page.getByRole('button', { name: 'Mehrere erstellen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Weitere Optionen zum Erstellen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Alle geladenen auswählen', exact: true }).check();
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'In Tabelle bearbeiten', exact: true }),
  ).toHaveCount(0);
});

test('rejects unknown pasted lookup values and prevents invalid names from reaching the API', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/assets');
  await createTable(page);
  await expect(cell(page, 1, 'Name')).toBeVisible();
  await select(page, 1, 'Typ').evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'Unbekannter Typ');
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }),
    );
  });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('unbekannt oder mehrdeutig');
  await cell(page, 1, 'Seriennummer').fill('00100');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert').last()).toContainText('Name');
  expect(state.writes).toHaveLength(0);
});

test('creates multiple locations and types using the same table', async ({ page }) => {
  for (const [endpoint, path] of [
    ['locations', '/locations'],
    ['asset-types', '/config/types'],
  ]) {
    await page.unroute('**/api/**');
    const state = await setup(page, endpoint);
    await page.goto(path);
    await createTable(page);
    await expect(cell(page, 1, 'Name')).toBeVisible();
    await paste(page, 1, 'Name', 'Erster Eintrag\tBeschreibung\r\nZweiter Eintrag\tBeschreibung');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('2 gespeichert');
    expect(state.writes).toHaveLength(2);
    expect(state.writes[0].body).toMatchObject({ name: 'Erster Eintrag', areaUuids: ['area'] });
    if (endpoint === 'locations') expect(state.writes[0].body['locationType']).toBe('OTHER');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Schließen', exact: true })
      .last()
      .click();
  }
});

test('an unconfirmed create after a network failure is not resubmitted', async ({ page }) => {
  await setup(page);
  let attempts = 0;
  await page.route('**/api/assets', async (route) => {
    if (route.request().method() === 'POST') {
      attempts++;
      await route.abort('connectionreset');
    } else await route.fallback();
  });
  await page.goto('/assets');
  await createTable(page);
  await cell(page, 1, 'Name').fill('Verbindungstest');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'könnte bereits erstellt sein',
  );
  await expect(cell(page, 1, 'Name')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Speichern', exact: true }),
  ).toBeDisabled();
  expect(attempts).toBe(1);
});

test('active types add their fields dynamically; switching and undo retain values', async ({
  page,
}) => {
  const state = await setup(page, 'assets', {
    extraTypes: [
      {
        uuid: 'laptop',
        name: 'Laptop',
        tags: [],
        fieldDefinitions: [
          {
            fieldKey: 'memory',
            name: 'Arbeitsspeicher',
            fieldType: 'TEXT',
            required: true,
            sortOrder: 0,
          },
          {
            fieldKey: 'os',
            name: 'Betriebssystem',
            fieldType: 'SELECT',
            optionsJson: '["Windows","Linux"]',
            required: true,
            sortOrder: 1,
          },
        ],
      },
      {
        uuid: 'extinguisher',
        name: 'Feuerlöscher',
        tags: [],
        fieldDefinitions: [
          {
            fieldKey: 'capacity',
            name: 'Füllmenge',
            fieldType: 'NUMBER',
            required: false,
            sortOrder: 0,
          },
        ],
      },
    ],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/assets');
  await createTable(page);
  await expect(cell(page, 1, 'Name')).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Arbeitsspeicher', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Hersteller', exact: true })).toHaveCount(0);
  await choose(page, 1, 'Typ', 'Laptop');
  await expect(cell(page, 1, 'Arbeitsspeicher')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Füllmenge', exact: true })).toHaveCount(0);
  await expect(cell(page, 2, 'Arbeitsspeicher')).toHaveCount(0);
  await cell(page, 1, 'Name').fill('Laptop 1');
  await cell(page, 1, 'Arbeitsspeicher').fill('16 GB');
  await choose(page, 1, 'Betriebssystem', 'Linux');
  await choose(page, 1, 'Typ', 'Pressluftatmer');
  await expect(
    page.getByRole('columnheader', { name: 'Arbeitsspeicher', exact: true }),
  ).toHaveCount(0);
  await expect(cell(page, 1, 'Hersteller')).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(cell(page, 1, 'Arbeitsspeicher')).toHaveValue('16 GB');
  await expect(select(page, 1, 'Betriebssystem')).toContainText('Linux');
  await choose(page, 2, 'Typ', 'Pressluftatmer');
  await expect(cell(page, 2, 'Hersteller')).toBeVisible();
  await expect(cell(page, 1, 'Hersteller')).toHaveCount(0);
  await cell(page, 2, 'Name').fill('PA 1');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 gespeichert');
  expect(state.writes[0].body['fieldValues']).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'memory', value: '16 GB', customAssetField: false }),
      expect.objectContaining({ fieldKey: 'os', value: 'Linux', customAssetField: false }),
    ]),
  );
  expect(state.writes[1].body['fieldValues']).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ fieldKey: 'memory' })]),
  );
});

test('shared dropdown panels stay above the table and multi-selection saves UUIDs', async ({
  page,
}) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/assets');
  await createTable(page);
  await cell(page, 1, 'Name').fill('Funkgerät');
  const type = select(page, 1, 'Typ');
  await type.click();
  await expect(page.locator('dialog app-search-select .panel:visible')).toBeVisible();
  const panel = page.locator('dialog app-search-select .panel:visible');
  await expect(panel.locator('input')).toBeFocused();
  await panel.locator('input').fill('Press');
  await page.getByRole('option', { name: 'Pressluftatmer', exact: true }).click();
  const tags = cell(page, 1, 'Tags');
  await tags.click();
  await expect(page.getByRole('option', { name: 'Direkt', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'Direkt', exact: true }).click();
  await cell(page, 1, 'Name').click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 gespeichert');
  expect(state.writes[0].body).toMatchObject({
    assetTypeUuid: 'type',
    tagUuids: ['direct'],
    areaUuids: ['area'],
  });
});

test('text inputs fill cells when a description increases the row height', async ({ page }) => {
  await setup(page);
  await page.goto('/assets');
  await createTable(page);
  await cell(page, 1, 'Beschreibung').evaluate((element) => {
    element.style.height = '130px';
  });
  const input = cell(page, 1, 'Name');
  const bounds = await input.boundingBox();
  const cellBounds = await input.locator('..').boundingBox();
  expect(bounds).not.toBeNull();
  expect(cellBounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThan(120);
  expect(Math.abs(bounds!.height - cellBounds!.height)).toBeLessThan(2);
  expect(Math.abs(bounds!.width - cellBounds!.width)).toBeLessThan(2);
  await input.click({ position: { x: 12, y: bounds!.height - 12 } });
  await expect(input).toBeFocused();
  await input.fill('Atemschutzgerät');
  await expect(input).toHaveValue('Atemschutzgerät');
});

test('column widths can be dragged and reset when reopening the table', async ({ page }) => {
  await setup(page);
  await page.goto('/assets');
  await createTable(page);
  const handle = page.getByRole('separator', { name: 'Spaltenbreite anpassen: Name', exact: true });
  const input = cell(page, 1, 'Name');
  const before = (await input.boundingBox())!.width;
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + bounds.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await input.boundingBox())!.width).toBeCloseTo(before + 100, 0);
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  expect((await input.boundingBox())!.width).toBeCloseTo(before + 84, 0);
  await page.getByRole('dialog').getByRole('button', { name: 'Schließen', exact: true }).first().click();
  await createTable(page);
  expect((await cell(page, 1, 'Name').boundingBox())!.width).toBeCloseTo(before, 0);
});

test('textareas fill taller cells and remain vertically resizable', async ({ page }) => {
  await setup(page);
  await page.goto('/assets');
  await createTable(page);
  const textarea = cell(page, 1, 'Beschreibung');
  await textarea.locator('..').locator('..').locator('.result').evaluate((element) => {
    element.style.height = '140px';
  });
  const bounds = await textarea.boundingBox();
  const cellBounds = await textarea.locator('..').boundingBox();
  expect(bounds!.height).toBeGreaterThan(130);
  expect(Math.abs(bounds!.height - cellBounds!.height)).toBeLessThan(2);
  await textarea.evaluate((element) => { element.style.height = '50px'; });
  expect((await textarea.boundingBox())!.height).toBeGreaterThan(130);
  await textarea.evaluate((element) => { element.style.height = '190px'; });
  expect((await textarea.boundingBox())!.height).toBeGreaterThan(180);
  await textarea.fill('Mehrzeilige Beschreibung');
  await expect(textarea).toHaveValue('Mehrzeilige Beschreibung');
});

test('new split button supports keyboard dismissal and single creation', async ({ page }) => {
  await setup(page);
  await page.goto('/assets');
  const trigger = page.getByRole('button', { name: 'Weitere Optionen zum Erstellen', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Mehrere erstellen', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.locator('.create-actions').getByRole('button', { name: 'Neu', exact: true }).click();
  await expect(page).toHaveURL(/\/assets\/new$/);
});
