import { expect, Page, test } from '@playwright/test';
import { inventoryTree } from '../src/app/features/inventory/util/inventory-tree';
import { pageOf } from './support/paging';

function entries(endpoint: string) {
  const key = endpoint === 'assets' ? 'parentAssetUuid' : 'parentLocationUuid';
  return [
    {
      uuid: 'child',
      name: endpoint === 'assets' ? 'SIM Karte' : 'Fahrzeughalle',
      [key]: 'parent',
      parentAssetNote: 'SIM Slot 1',
    },
    { uuid: 'parent', name: endpoint === 'assets' ? 'iPad' : 'Gerätehaus' },
    { uuid: 'other', name: 'Weiterer Eintrag' },
    { uuid: 'grandchild', name: 'Untergeordneter Eintrag', [key]: 'child' },
    { uuid: 'sibling', name: 'Zubehör', [key]: 'parent' },
  ].map((item) => ({ ...item, areaUuids: [], images: [] }));
}

async function setup(page: Page, endpoint: string) {
  const items = entries(endpoint);
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    return route.fulfill({
      json:
        path === '/api/auth/me'
          ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
          : path === `/api/${endpoint}/page`
            ? pageOf(items, url)
            : path === `/api/${endpoint}`
              ? items
              : [],
    });
  });
  return items;
}

test('tree ordering is stable, retains orphans and does not lose cyclic entries', () => {
  const tree = inventoryTree(entries('assets'), 'assets');
  expect(tree.map((row) => row.item.uuid)).toEqual([
    'parent',
    'child',
    'grandchild',
    'sibling',
    'other',
  ]);
  expect(tree.map((row) => row.depth)).toEqual([0, 1, 2, 1, 0]);
  expect(tree[2].guides).toEqual([true, true]);
  expect(tree[3].last).toBe(true);
  const malformed = [
    { uuid: 'a', name: 'A', parentAssetUuid: 'b' },
    { uuid: 'b', name: 'B', parentAssetUuid: 'a' },
    { uuid: 'orphan', name: 'Sichtbarer Treffer', parentAssetUuid: 'hidden' },
    { uuid: 'self', name: 'Selbstbezug', parentAssetUuid: 'self' },
  ];
  const rows = inventoryTree(malformed, 'assets');
  expect(new Set(rows.map((row) => row.item.uuid)).size).toBe(4);
  expect(rows.find((row) => row.item.uuid === 'orphan')?.depth).toBe(0);
  expect(inventoryTree(entries('assets'), 'asset-types').every((row) => row.depth === 0)).toBe(
    true,
  );
});

for (const endpoint of ['assets', 'locations']) {
  for (const width of [1280, 390, 320]) {
    test(`nested list preserves visual selection and filtering (${endpoint}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const items = await setup(page, endpoint);
      await page.goto(`/${endpoint}`);
      const rows = page.locator('.items article.item');
      await expect(rows.locator('.item-main > strong')).toHaveText(items.map((item) => item.name));
      await expect(page.locator('.tree-guides')).toHaveCount(0);
      await page.getByRole('button', { name: 'Baumansicht', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Baumansicht', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(rows.locator('.item-main > strong')).toHaveText(
        ['iPad', 'SIM Karte', 'Untergeordneter Eintrag', 'Zubehör', 'Weiterer Eintrag'].map(
          (name) =>
            endpoint === 'locations'
              ? name.replace('iPad', 'Gerätehaus').replace('SIM Karte', 'Fahrzeughalle')
              : name,
        ),
      );
      const rootBox = (await rows.nth(0).boundingBox())!;
      const childBox = (await rows.nth(1).boundingBox())!;
      const grandBox = (await rows.nth(2).boundingBox())!;
      expect(childBox.x).toBeGreaterThan(rootBox.x);
      expect(grandBox.x).toBeGreaterThan(childBox.x);
      expect(
        await rows
          .nth(1)
          .locator('.tree-guide.branch')
          .evaluate((element) => getComputedStyle(element, '::after').borderTopWidth),
      ).toBe('1px');
      if (endpoint === 'assets') await expect(rows.nth(1)).toContainText('SIM Slot 1');
      await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
      await rows.nth(0).locator('app-selection-checkbox input').click();
      await rows
        .nth(2)
        .locator('app-selection-checkbox input')
        .click({ modifiers: ['Shift'] });
      await expect(page.locator('.items .is-selected .item-main > strong')).toHaveText([
        items[1].name,
        items[0].name,
        items[3].name,
      ]);
      for (let index = 0; index < 3; index++) {
        await expect(rows.nth(index).locator('app-selection-checkbox input')).toBeChecked();
        await expect(rows.nth(index).locator('.selection-mark svg')).toHaveCount(1);
        await expect(rows.nth(index).locator('.selection-mark')).toHaveCSS(
          'background-color',
          'rgb(182, 47, 47)',
        );
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: test.info().outputPath('nested-list.png'), fullPage: true });
      await page.getByRole('button', { name: 'Kachelansicht', exact: true }).click();
      await expect(rows.first().locator('.item-main > strong')).toHaveText(items[0].name);
      await expect(page.locator('.tree-guides')).toHaveCount(0);
      await page.getByRole('button', { name: 'Listenansicht', exact: true }).click();
      await expect(rows.locator('.item-main > strong')).toHaveText(items.map((item) => item.name));
      await expect(page.locator('.tree-guides')).toHaveCount(0);
      await page.getByRole('button', { name: 'Baumansicht', exact: true }).click();
      await page.locator('.search-box input').fill(items[0].name);
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute('data-depth', '0');
      await expect(rows.first()).toContainText(items[0].name);
    });
  }
}

test('a parent arriving on the next page groups an already visible child without duplication', async ({
  page,
}) => {
  const items = await setup(page, 'assets');
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/assets/page?**', async (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') ?? 0);
    if (pageNumber > 0) await next;
    await route.fulfill({
      json: {
        items: [pageNumber === 0 ? items[0] : items[1]],
        total: 2,
        page: pageNumber,
        size: 1,
        hasMore: pageNumber === 0,
      },
    });
  });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Baumansicht', exact: true }).click();
  const rows = page.locator('.items article.item');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-depth', '0');
  release();
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('.item-main > strong')).toHaveText(['iPad', 'SIM Karte']);
  await expect(rows.nth(1)).toHaveAttribute('data-depth', '1');
});
