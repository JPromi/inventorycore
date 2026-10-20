import { expect, Page, test } from '@playwright/test';

const status = (uuid: string, name: string, category: string, color: string, systemKey: string | null = uuid.toUpperCase(), areaUuid: string | null = null) =>
  ({ uuid, systemKey, name, color, category, areaUuid, deleted: false });

const available = status('available', 'Vorhanden', 'ACTIVE', '#15803d');
const defect = status('defect', 'Defekt', 'DEFECT', '#b62f2f');
const retired = status('retired', 'Ausgeschieden', 'RETIRED', '#78716c');
const lent = status('lent', 'Verliehen', 'ACTIVE', '#7c3aed', null, 'atemschutz');
const vehicleOnly = status('werkstatt', 'In der Werkstatt', 'DEFECT', '#d97706', null, 'fahrzeuge');

const areas = [
  { uuid: 'atemschutz', name: 'Atemschutz', defaultArea: true },
  { uuid: 'fahrzeuge', name: 'Fahrzeuge', defaultArea: false },
];

interface Calls {
  changes: Record<string, unknown>[];
  pages: URLSearchParams[];
  created: Record<string, unknown>[];
  saved: Record<string, unknown>[];
}

async function mockApi(page: Page): Promise<Calls> {
  const calls: Calls = { changes: [], pages: [], created: [], saved: [] };
  let pa = {
    uuid: 'pa1', name: 'Atemschutzgerät PA 1', invId: 'FW-0042', areaUuids: ['atemschutz'], tags: [],
    status: available, statusChangedAt: '2026-09-01T08:00:00Z',
  };
  const history = [
    { uuid: 'h2', fromStatus: defect, toStatus: available, comment: null, changedAt: '2026-09-01T08:00:00Z',
      changedByName: 'Gerätewart', inspectionUuid: 'jp', inspectionTitle: 'Jahresprüfung 2026' },
    { uuid: 'h1', fromStatus: null, toStatus: defect, comment: 'Ventil undicht', changedAt: '2026-08-20T10:00:00Z',
      changedByName: 'Admin', inspectionUuid: null, inspectionTitle: null },
  ];
  const old = { uuid: 'alt', name: 'Alte Wärmebildkamera', invId: 'FW-0007', areaUuids: ['atemschutz'], tags: [], status: retired };
  const broken = { uuid: 'tks', name: 'Tragkraftspritze', invId: 'FW-0011', areaUuids: ['atemschutz'], tags: [], status: defect };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/assets/pa1/status' && request.method() === 'POST') {
      const body = request.postDataJSON();
      calls.changes.push(body);
      const to = [available, defect, retired, lent].find((entry) => entry.uuid === body.statusUuid)!;
      history.unshift({ uuid: 'h3', fromStatus: pa.status, toStatus: to, comment: body.comment, changedAt: '2026-10-20T09:00:00Z',
        changedByName: 'Admin', inspectionUuid: null, inspectionTitle: null });
      pa = { ...pa, status: to, statusChangedAt: '2026-10-20T09:00:00Z' };
      return route.fulfill({ json: pa });
    }
    if (path === '/api/assets/pa1' && request.method() === 'PATCH') {
      calls.saved.push(request.postDataJSON());
      return route.fulfill({ json: pa });
    }
    if (path === '/api/asset-statuses' && request.method() === 'POST') {
      calls.created.push(request.postDataJSON());
      return route.fulfill({ status: 201, json: { ...request.postDataJSON(), uuid: 'neu', systemKey: null, deleted: false } });
    }
    if (path === '/api/assets/page') {
      calls.pages.push(url.searchParams);
      const wanted = url.searchParams.getAll('status');
      const items = [pa, broken, old].filter((asset) => !wanted.length || wanted.includes(asset.status.uuid));
      return route.fulfill({ json: { items, total: items.length, page: 0, size: 50, hasMore: false } });
    }
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
      : path === '/api/areas' ? areas
      : path === '/api/asset-statuses' ? [available, defect, retired, lent, vehicleOnly]
      : path === '/api/assets/pa1' ? pa
      : path === '/api/assets/pa1/status-history' ? history
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json: body });
  });
  return calls;
}

test('the status is changed on the asset page with a comment and kept in the history', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/assets/pa1');
  const card = page.locator('app-asset-status-card');
  await expect(card.locator('.current')).toContainText('Vorhanden');

  await card.getByRole('button', { name: 'Status ändern' }).click();
  // a status of another area does not fit this asset
  await expect(card.locator('.option')).toHaveText(['Vorhanden', 'Defekt', 'Ausgeschieden', 'Verliehen']);
  await card.locator('.option', { hasText: 'Ausgeschieden' }).click();
  await card.getByRole('textbox', { name: 'Kommentar' }).fill('Lebensdauer erreicht, ausgemustert');
  await card.getByRole('button', { name: 'Speichern' }).click();

  await expect(card.locator('.current')).toContainText('Ausgeschieden');
  expect(calls.changes).toEqual([{ statusUuid: 'retired', comment: 'Lebensdauer erreicht, ausgemustert' }]);
  await expect(page.locator('.page-header h1')).toHaveClass(/retired/);
  await expect(card).toContainText('nicht mehr geprüft');

  // the history has its own page; the card only links to it
  await card.getByRole('link', { name: 'Verlauf' }).click();
  await expect(page).toHaveURL(/\/assets\/pa1\/status-history$/);
  await expect(page.getByRole('heading', { name: 'Statusverlauf' })).toBeVisible();
  const entries = page.locator('.history li');
  await expect(entries).toHaveCount(3);
  await expect(entries.first()).toContainText('Lebensdauer erreicht, ausgemustert');
  await expect(entries.nth(1).getByRole('link', { name: /Aus Prüfung „Jahresprüfung 2026“/ })).toHaveAttribute('href', '/inspections/jp');
  await expect(entries.nth(2)).toContainText('Angelegt als');
  await expect(entries.nth(2)).toContainText('Ventil undicht');
});

test('the list shows special statuses, retired assets in grey and filters by status', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await mockApi(page);
  await page.goto('/assets');
  const rows = page.locator('article.item');
  await expect(rows).toHaveCount(3);
  // "Vorhanden" is the normal case and not shown
  await expect(rows.nth(0).locator('app-asset-status-badge')).toHaveCount(0);
  await expect(rows.nth(1).locator('app-asset-status-badge')).toHaveText('Defekt');
  await expect(rows.nth(2)).toHaveClass(/retired/);

  const filter = page.locator('app-asset-status-filter');
  await filter.getByRole('button', { name: 'Status filtern' }).click();
  await filter.getByRole('menuitemcheckbox', { name: 'Defekt' }).click();
  await filter.getByRole('menuitemcheckbox', { name: 'Ausgeschieden' }).click();
  await expect(filter.locator('.trigger')).toContainText('2 Status');
  await expect.poll(() => calls.pages.at(-1)?.getAll('status')).toEqual(['defect', 'retired']);
  await expect(rows).toHaveCount(2);

  await filter.getByTitle('Statusfilter entfernen').click();
  await expect.poll(() => calls.pages.at(-1)?.getAll('status')).toEqual([]);
  await expect(rows).toHaveCount(3);
});

test('custom statuses are configured per area', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/config/statuses');
  await expect(page.locator('.card').first().locator('li')).toHaveCount(3);
  const custom = page.locator('.status-list.editable li');
  await expect(custom).toHaveCount(2);
  await expect(custom.first()).toContainText('Atemschutz');

  // the shared dropdowns, as everywhere else
  const create = page.locator('form.create-row');
  await create.getByRole('textbox', { name: 'Name des Status' }).fill('Beim Hersteller');
  await create.locator('app-search-select').nth(0).locator('.trigger').click();
  await page.getByRole('option', { name: 'Defekt', exact: true }).click();
  await create.locator('app-search-select').nth(1).locator('.trigger').click();
  await page.getByRole('option', { name: 'Fahrzeuge', exact: true }).click();
  await create.getByRole('button', { name: 'Anlegen' }).click();
  await expect.poll(() => calls.created.length).toBe(1);
  expect(calls.created[0]).toMatchObject({ name: 'Beim Hersteller', category: 'DEFECT', areaUuid: 'fahrzeuge' });

  // only the statuses of the area selected in the sidebar
  const switcher = page.locator('app-area-switcher');
  await switcher.locator('.trigger').click();
  await switcher.getByRole('button', { name: /^Fahrzeuge(?: nur)?$/ }).click();
  await expect(custom).toHaveCount(1);
  await expect(custom.first()).toContainText('Fahrzeuge');
  await expect(page.locator('.card').first().locator('li')).toHaveCount(3);
});

test('the form sets the status and asks for a comment only when it changes', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/assets/pa1/edit');
  const select = page.locator('app-search-select[name="statusUuid"]');
  await expect(select).toContainText('Vorhanden');
  await expect(page.locator('input[name="statusComment"]')).toHaveCount(0);
  await select.locator('.trigger').click();
  // a status of another area does not fit this asset
  await expect(page.getByRole('option', { name: 'In der Werkstatt' })).toHaveCount(0);
  await page.getByRole('option', { name: 'Defekt', exact: true }).click();
  await page.locator('input[name="statusComment"]').fill('Flaschenventil undicht');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => calls.saved.length).toBe(1);
  expect(calls.saved[0]).toMatchObject({ statusUuid: 'defect', statusComment: 'Flaschenventil undicht' });
});
