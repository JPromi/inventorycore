import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

async function setup(page: Page) {
  const requests: { endpoint: string; params: URLSearchParams }[] = [];
  const defect = { uuid: 'defect', systemKey: 'DEFECT', name: 'Defekt', category: 'DEFECT', deleted: false };
  const entries: Record<string, any[]> = {
    assets: [{ uuid: 'radio', name: 'Funkgerät', status: defect }, { uuid: 'mask', name: 'Atemschutzgerät' }],
    locations: [{ uuid: 'hall', name: 'Fahrzeughalle' }, { uuid: 'station', name: 'Gerätehaus' }],
    'asset-types': [{ uuid: 'radio-type', name: 'Funkgerätetyp' }, { uuid: 'mask-type', name: 'Atemschutztyp' }],
  };
  for (const list of Object.values(entries)) {
    for (const entry of list) Object.assign(entry, { areaUuids: ['area'], tags: [], images: [], fieldValues: [], fieldDefinitions: [] });
  }
  const tag = { uuid: 'radio-tag', name: 'Funk', areaUuid: 'area' };
  Object.assign(entries['assets'][0], { tags: [tag], locationUuid: 'hall', assetTypeUuid: 'radio-type' });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/', '');
    if (path === 'inspections/page') {
      requests.push({ endpoint: 'inspections', params: url.searchParams });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return route.fulfill({ json: {
        items: [], total: 0, page: 0, size: 50, hasMore: false, openCount: 0, completedCount: 1,
      } });
    }
    if (path.endsWith('/page') && entries[path.slice(0, -5)]) {
      const endpoint = path.slice(0, -5);
      requests.push({ endpoint, params: url.searchParams });
      const statuses = url.searchParams.getAll('status');
      const items = entries[endpoint].filter((entry) =>
        (!statuses.length || statuses.includes(entry.status?.uuid)) &&
        (!url.searchParams.get('tag') || entry.tags.some((tag: { uuid: string }) => tag.uuid === url.searchParams.get('tag'))) &&
        (!url.searchParams.get('location') || entry.locationUuid === url.searchParams.get('location')) &&
        (!url.searchParams.get('assetType') || entry.assetTypeUuid === url.searchParams.get('assetType')),
      );
      const pagingUrl = new URL(url);
      pagingUrl.searchParams.delete('status');
      await new Promise((resolve) => setTimeout(resolve, 80));
      return route.fulfill({ json: pageOf(items, pagingUrl) });
    }
    const [endpoint, uuid] = path.split('/');
    const json = path === 'auth/me'
      ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === 'areas' ? [{ uuid: 'area', name: 'Feuerwehr', defaultArea: true }]
        : path === 'asset-statuses' ? [defect]
          : path === 'tags' ? [tag]
          : path === 'customization' ? {}
            : entries[endpoint] ? (uuid ? entries[endpoint].find((entry) => entry.uuid === uuid) ?? [] : entries[endpoint]) : [];
    return route.fulfill({ json });
  });
  return requests;
}

for (const config of [
  { path: '/assets', endpoint: 'assets', name: 'Funkgerät', search: 'Funk', menu: 'Inventar' },
  { path: '/locations', endpoint: 'locations', name: 'Fahrzeughalle', search: 'Fahrzeug', menu: 'Standorte' },
  { path: '/config/types', endpoint: 'asset-types', name: 'Funkgerätetyp', search: 'Funk', menu: 'Typen' },
]) {
  test(`${config.endpoint}: editing from a filtered list returns straight to that list`, async ({ page }) => {
    await setup(page);
    await page.goto(config.path);
    const search = page.locator('.search-box input');
    await search.fill(config.search);
    const rows = page.locator('article.item');
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await expect(page).toHaveURL(/\/edit$/);
    const back = page.getByRole('link', { name: 'Zurück', exact: true });
    await expect(back).toHaveAttribute('href', config.path);
    await back.click();
    await expect(page).toHaveURL(new RegExp(config.path + '$'));
    await expect(search).toHaveValue(config.search);
    await expect(rows).toHaveCount(1);
    await page.goForward();
    await expect(page).toHaveURL(/\/edit$/);
    await page.getByRole('link', { name: 'Abbrechen', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(config.path + '$'));
    await expect(search).toHaveValue(config.search);
  });

  test(`${config.endpoint}: back restores filters while a navigation link starts fresh`, async ({ page }) => {
    const requests = await setup(page);
    await page.goto(config.path);
    const search = page.locator('.search-box input');
    await search.fill(config.search);
    if (config.endpoint === 'assets') {
      await page.locator('app-asset-status-filter .trigger').click();
      await page.getByRole('menuitemcheckbox', { name: 'Defekt', exact: true }).click();
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('article.item')).toHaveCount(1);
    await page.locator('article.item').filter({ hasText: config.name }).first().click();
    await expect(page).not.toHaveURL(new RegExp(config.path + '$'));
    const before = requests.length;
    await page.goBack();
    await expect(search).toHaveValue(config.search);
    await expect(page.locator('article.item')).toHaveCount(1);
    const restored = requests.slice(before).filter((request) => request.endpoint === config.endpoint);
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.every((request) => request.params.get('q') === config.search)).toBe(true);
    if (config.endpoint === 'assets') {
      await expect(page.locator('app-asset-status-filter .trigger')).toContainText('Defekt');
      expect(restored.every((request) => request.params.getAll('status').includes('defect'))).toBe(true);
    }
    await page.goForward();
    await page.getByRole('link', { name: 'Zurück', exact: true }).click();
    await expect(search).toHaveValue(config.search);
    await page.locator('article.item').filter({ hasText: config.name }).first().click();
    if (config.endpoint === 'asset-types') {
      await page.getByRole('button', { name: 'Konfiguration', exact: true }).click();
    }
    await page.locator('nav').getByRole('link', { name: config.menu, exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page.locator('article.item')).toHaveCount(2);
  });
}

test('separate visits of the same list retain their own search in browser history', async ({ page }) => {
  await setup(page);
  await page.goto('/assets');
  const search = page.locator('.search-box input');
  await search.fill('Funk');
  await expect(page.locator('article.item')).toHaveCount(1);
  await page.locator('article.item').filter({ hasText: 'Funkgerät' }).first().click();
  await page.locator('nav').getByRole('link', { name: 'Inventar', exact: true }).click();
  await expect(search).toHaveValue('');
  await search.fill('Atem');
  await expect(page.locator('article.item')).toHaveCount(1);
  await page.getByText('Atemschutzgerät', { exact: true }).first().click();
  await page.goBack();
  await expect(search).toHaveValue('Atem');
  await page.goBack();
  await expect(page).toHaveURL(/\/assets\/radio$/);
  await page.goBack();
  await expect(search).toHaveValue('Funk');
  await expect(page.locator('article.item')).toHaveCount(1);
});

test('clicking the current list navigation link clears filters without adding history entries', async ({ page }) => {
  await setup(page);
  await page.goto('/assets');
  const search = page.locator('.search-box input');
  await search.fill('Funk');
  await expect(page.locator('article.item')).toHaveCount(1);
  const length = await page.evaluate(() => history.length);
  await page.locator('nav').getByRole('link', { name: 'Inventar', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('article.item')).toHaveCount(2);
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('inspection tab restoration survives delayed initial counts', async ({ page }) => {
  const requests = await setup(page);
  await page.goto('/inspections');
  const tabs = page.getByRole('tab');
  await expect(tabs.last()).toHaveClass(/active/);
  await tabs.nth(2).click();
  await page.locator('.search-box input').fill('Jahresprüfung');
  await page.locator('nav').getByRole('link', { name: 'Inventar', exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/);
  await page.goBack();
  await expect(page.locator('.search-box input')).toHaveValue('Jahresprüfung');
  await expect.poll(() => requests.filter((request) => request.endpoint === 'inspections').at(-1)?.params.get('q')).toBe('Jahresprüfung');
  await expect(tabs.nth(2)).toHaveClass(/active/);
  expect(requests.filter((request) => request.endpoint === 'inspections').at(-1)?.params.get('status')).toBe('COMPLETED');
  await page.locator('nav').getByRole('link', { name: 'Prüfungen', exact: true }).click();
  await expect(page.locator('.search-box input')).toHaveValue('');
  await expect(tabs.last()).toHaveClass(/active/);
});

test('all selected asset filters are reapplied after returning from editing repeatedly', async ({ page }) => {
  const requests = await setup(page);
  await page.goto('/assets');
  for (const [placeholder, option] of [
    ['Alle Tags', 'Funk'],
    ['Alle Standorte', 'Fahrzeughalle'],
    ['Alle Typen', 'Funkgerätetyp'],
  ]) {
    await page.getByRole('button', { name: placeholder, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  await page.locator('app-asset-status-filter .trigger').click();
  await page.getByRole('menuitemcheckbox', { name: 'Defekt', exact: true }).click();
  await page.keyboard.press('Escape');
  for (let visit = 0; visit < 2; visit++) {
    await expect(page.locator('article.item')).toHaveCount(1);
    await page.locator('article.item').getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await expect(page).toHaveURL(/\/assets\/radio\/edit$/);
    const before = requests.length;
    await page.getByRole('link', { name: 'Zurück', exact: true }).click();
    await expect(page).toHaveURL(/\/assets$/);
    await expect(page.locator('article.item')).toHaveCount(1);
    await expect(page.locator('app-asset-status-filter .trigger')).toContainText('Defekt');
    for (const label of ['Funk', 'Fahrzeughalle', 'Funkgerätetyp']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    const restored = requests.slice(before).filter((request) => request.endpoint === 'assets');
    expect(restored.length).toBeGreaterThan(0);
    for (const request of restored) {
      expect(request.params.get('tag')).toBe('radio-tag');
      expect(request.params.get('location')).toBe('hall');
      expect(request.params.get('assetType')).toBe('radio-type');
      expect(request.params.getAll('status')).toEqual(['defect']);
    }
  }
});
