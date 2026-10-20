import { expect, Page, test } from '@playwright/test';

const areas = [
  { uuid: 'atemschutz', name: 'Atemschutz', defaultArea: true },
  { uuid: 'fahrzeuge', name: 'Fahrzeuge', defaultArea: false },
];

const counts = (present: number, missing: number, defect: number) => ({
  expected: present + missing, present, missing, passed: 0, failed: 0, pending: 0, unexpected: 0, defect, functionUnchecked: 0,
});

/** The mocked server answers per area selection, like the real one. */
function dashboard(selection: string[], canInspect = true) {
  const onlyVehicles = selection.length === 1 && selection[0] === 'fahrzeuge';
  return {
    assetCount: onlyVehicles ? 3 : 12,
    locationCount: 4,
    assetTypeCount: 2,
    tagCount: 2,
    canInspect,
    due: { overdue: 1, dueSoon: 1, ok: 5 },
    nextDue: canInspect ? [
      { assetUuid: 'pa1', assetName: 'Atemschutzgerät PA 1', invId: 'FW-2026-0042', locationName: 'Gerätehaus', inspectionTypeUuid: 'jp',
        inspectionTypeName: 'Jahresprüfung', state: 'OVERDUE', daysUntilDue: -3, assetAreaUuids: ['atemschutz'] },
      { assetUuid: 'hlf', assetName: 'HLF 20', invId: null, locationName: null, inspectionTypeUuid: 'fk',
        inspectionTypeName: 'Fahrzeugkontrolle', state: 'DUE', daysUntilDue: 4, assetAreaUuids: ['fahrzeuge'] },
    ] : [],
    openInspectionCount: 1,
    completedInspectionCount: 2,
    recentInspections: canInspect ? [
      { uuid: 'run', title: 'Inventur Gerätehaus', mode: 'INVENTORY', status: 'COMPLETED', completedAt: '2026-10-18T09:00:00Z',
        completedByName: 'Admin', areaUuids: ['atemschutz'], areaNames: ['Atemschutz'], counts: counts(8, 1, 0) },
    ] : [],
    results: { ok: 7, defect: 1, missing: 2, failed: 0 },
    topTags: [{ uuid: 'tag', name: 'Atemschutz', color: '#c62828', count: 6 }],
    assetsByType: [
      { uuid: 'pa', name: 'Pressluftatmer', color: null, count: 8 },
      { uuid: null, name: null, color: null, count: 4 },
    ],
    otherTypeAssetCount: 0,
  };
}

async function mockApi(page: Page, canInspect = true): Promise<string[][]> {
  const requests: string[][] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/dashboard') {
      const selection = url.searchParams.getAll('areas');
      requests.push(selection);
      return route.fulfill({ json: dashboard(selection, canInspect) });
    }
    const body = url.pathname === '/api/auth/me'
      ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
      : url.pathname === '/api/areas' ? areas : [];
    await route.fulfill({ json: body });
  });
  return requests;
}

test('dashboard shows numbers, due and recent inspections and follows the area selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const requests = await mockApi(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);

  const tiles = page.getByRole('region', { name: 'Kennzahlen' });
  await expect(tiles.getByRole('link', { name: /Assets/ })).toContainText('12');
  await expect(tiles.getByRole('link', { name: /Überfällig/ })).toHaveClass(/critical/);

  const next = page.locator('section', { has: page.getByRole('heading', { name: 'Nächste Prüfungen' }) });
  await expect(next.getByRole('link', { name: 'Atemschutzgerät PA 1' })).toHaveAttribute('href', '/assets/pa1');
  await expect(next).toContainText('überfällig seit 3 Tagen');
  await expect(next).toContainText('fällig in 4 Tagen');

  const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Letzte Prüfungen' }) });
  await expect(recent).toContainText('8 von 9 vorhanden');
  await expect(recent).toContainText('1 Auffälligkeit');
  await expect(recent).toContainText('1 offene Prüfung');
  await expect(page.locator('.headline')).toContainText('70 %');

  await expect(page.locator('.bars li')).toHaveText([/Pressluftatmer\s*8/, /Ohne Typ\s*4/]);
  const legend = page.locator('.legend');
  await expect(legend).toContainText('In Ordnung');
  await expect(legend).toContainText('Nicht vorhanden oder mangelhaft');
  await expect(page.locator('.result-part')).toHaveCount(3);
  await expect(page.locator('.tags')).toContainText('Atemschutz');

  // a different area in the sidebar loads the numbers of that area
  const switcher = page.locator('app-area-switcher');
  await switcher.locator('.trigger').click();
  await switcher.getByRole('button', { name: /^Fahrzeuge(?: nur)?$/ }).click();
  await expect(tiles.getByRole('link', { name: /Assets/ })).toContainText('3');
  await expect(page.getByText('Ausgewählte Bereiche', { exact: true })).toBeVisible();
  expect(requests[0]).toEqual([]);
  expect(requests.at(-1)).toEqual(['fahrzeuge']);
});

test('dashboard without the right to inspect shows only the inventory', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Kennzahlen' }).getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Nächste Prüfungen' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Prüfergebnisse' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bestand nach Typ' })).toBeVisible();
});
