import { expect, Page, test } from '@playwright/test';

const stephansplatz = {
  address: 'Stephansplatz 1, 1010 Wien, Österreich', label: '1, Stephansplatz, Innere Stadt, Wien, 1010, Österreich',
  street: 'Stephansplatz 1', postalCode: '1010', city: 'Wien', country: 'Österreich', latitude: 48.208493, longitude: 16.373149,
};
const graz = {
  address: 'Stephansplatz, 8010 Graz, Österreich', label: 'Stephansplatz, Graz, 8010, Österreich',
  street: 'Stephansplatz', postalCode: '8010', city: 'Graz', country: 'Österreich', latitude: 47.0707, longitude: 15.4395,
};

async function setup(page: Page) {
  const saved: Record<string, unknown>[] = [];
  const lookups: string[] = [];
  const tiles: string[] = [];
  // map tiles are not loaded from the internet in tests (1x1 transparent PNG)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  await page.route('https://tile.openstreetmap.org/**', route => {
    tiles.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: png });
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/geocoding/search') {
      lookups.push(`search:${url.searchParams.get('q')}`);
      return route.fulfill({ json: [stephansplatz, graz] });
    }
    if (path === '/api/geocoding/reverse') {
      lookups.push(`reverse:${url.searchParams.get('lat')},${url.searchParams.get('lon')}`);
      return route.fulfill({ json: stephansplatz });
    }
    if (['POST', 'PATCH'].includes(request.method()) && path.startsWith('/api/locations')) {
      const body = request.postDataJSON();
      saved.push(body);
      return route.fulfill({ json: { ...body, uuid: 'new', images: [], areaUuids: ['area'] } });
    }
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
      : path === '/api/locations/vienna' ? { uuid: 'vienna', name: 'Zentrale', address: stephansplatz.address, street: 'Stephansplatz 1',
        postalCode: '1010', city: 'Wien', country: 'Österreich', latitude: 48.208493, longitude: 16.373149, images: [], areaUuids: ['area'] }
      : path === '/api/locations/old' ? { uuid: 'old', name: 'Altes Lager', address: 'Industriestraße 5, 4020 Linz', images: [], areaUuids: ['area'] }
      : path === '/api/locations/plain' ? { uuid: 'plain', name: 'Lager ohne Position', images: [], areaUuids: ['area'] }
      : path === '/api/areas' ? [{ uuid: 'area', name: 'EDV', defaultArea: true }]
      : path === '/api/customization' ? {} : [];
    return route.fulfill({ json: body });
  });
  return { saved, lookups, tiles };
}

const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const number = (page: Page, name: string) => page.getByRole('spinbutton', { name, exact: true });

test('the address is split into fields in the position section and coordinates are found from it', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/locations/new');
  await field(page, 'Name').fill('Zentrale');
  await expect(page.getByRole('textbox', { name: 'Adresse', exact: true })).toHaveCount(0);
  const position = page.locator('.form-section', { has: page.getByRole('heading', { name: 'Position' }) });
  // the same inputs as the rest of the form
  const nameStyle = await field(page, 'Name').evaluate(element => getComputedStyle(element).borderRadius + getComputedStyle(element).minHeight);
  expect(await position.getByRole('textbox', { name: 'Ort', exact: true }).evaluate(element => getComputedStyle(element).borderRadius + getComputedStyle(element).minHeight)).toBe(nameStyle);

  const findCoordinates = page.getByRole('button', { name: 'Koordinaten ermitteln' });
  await expect(findCoordinates).toBeDisabled();
  await field(page, 'Straße und Hausnummer').fill('Stephansplatz 1');
  await field(page, 'PLZ').fill('1010');
  await field(page, 'Ort').fill('Wien');
  await findCoordinates.click();
  // several matches: the user picks one
  await page.getByRole('button', { name: /Stephansplatz 1, 1010 Wien/ }).click();
  await expect(number(page, 'Breitengrad')).toHaveValue('48.208493');
  await expect(number(page, 'Längengrad')).toHaveValue('16.373149');
  const map = page.locator('app-location-map');
  const link = map.getByRole('link', { name: 'In OpenStreetMap öffnen' });
  await expect(map.locator('.leaflet-container')).toBeVisible();
  await expect(map.locator('.location-map-marker')).toHaveCount(1);
  await expect(link).toHaveAttribute('href', /mlat=48\.208493&mlon=16\.373149/);
  await expect.poll(() => state.tiles.length).toBeGreaterThan(0);
  await expect(map.locator('.leaflet-control-attribution')).toHaveText('© OpenStreetMap');
  // the Leaflet map stays the same element; typing elsewhere does not touch it
  await map.locator('.leaflet-container').evaluate(element => element.setAttribute('data-probe', 'same-map'));
  const tilesBefore = state.tiles.length;
  await field(page, 'Land').pressSequentially('Österreich');
  await field(page, 'Name').press('End');
  await field(page, 'Name').pressSequentially(' Wien');
  await page.waitForTimeout(1000);
  expect(state.tiles.length).toBe(tilesBefore);
  await expect(map.locator('.leaflet-container[data-probe="same-map"]')).toHaveCount(1);
  // new coordinates move the marker on the same map once typing has paused, without intermediate values
  const seen: string[] = [];
  await page.exposeFunction('linkChanged', (href: string) => seen.push(href));
  await link.evaluate(element => new MutationObserver(() => (window as unknown as { linkChanged: (href: string) => void })
    .linkChanged(element.getAttribute('href') ?? '')).observe(element, { attributes: true, attributeFilter: ['href'] }));
  await number(page, 'Breitengrad').pressSequentially('7', { delay: 50 });
  await expect(link).toHaveAttribute('href', /mlat=48\.2084937&mlon=16\.373149|mlat=48\.208494&mlon=16\.373149/);
  await number(page, 'Breitengrad').fill('48.21');
  await expect(link).toHaveAttribute('href', /mlat=48\.210000&mlon=16\.373149/);
  await expect(map.locator('.leaflet-container[data-probe="same-map"]')).toHaveCount(1);
  expect(seen).toHaveLength(2);
  await number(page, 'Breitengrad').fill('48.208493');
  await expect(link).toHaveAttribute('href', /mlat=48\.208493&mlon=16\.373149/);
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0]).toMatchObject({ name: 'Zentrale Wien', address: null, street: 'Stephansplatz 1', postalCode: '1010', city: 'Wien',
    country: 'Österreich', latitude: 48.208493, longitude: 16.373149 });
  expect(state.lookups).toEqual(['search:Stephansplatz 1, 1010 Wien']);
});

test('the address parts are found from coordinates; incomplete coordinates block saving', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/locations/new');
  await field(page, 'Name').fill('Zentrale');
  const create = page.getByRole('button', { name: 'Erstellen', exact: true });
  const findAddress = page.getByRole('button', { name: 'Adresse ermitteln' });

  await number(page, 'Breitengrad').fill('48.208493');
  await expect(page.getByRole('alert')).toContainText('Breiten- und Längengrad');
  await expect(create).toBeDisabled();
  await expect(findAddress).toBeDisabled();
  await number(page, 'Längengrad').fill('200');
  await expect(page.getByRole('alert')).toContainText('zwischen -180 und 180');
  await expect(create).toBeDisabled();

  await number(page, 'Längengrad').fill('16.373149');
  await expect(create).toBeEnabled();
  await findAddress.click();
  await expect(field(page, 'Straße und Hausnummer')).toHaveValue('Stephansplatz 1');
  await expect(field(page, 'PLZ')).toHaveValue('1010');
  await expect(field(page, 'Ort')).toHaveValue('Wien');
  await expect(field(page, 'Land')).toHaveValue('Österreich');
  await expect(page.getByRole('status')).toContainText('Adresse übernommen');
  await create.click();
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0]).toMatchObject({ street: 'Stephansplatz 1', country: 'Österreich', latitude: 48.208493, longitude: 16.373149 });
  expect(state.lookups).toEqual(['reverse:48.208493,16.373149']);
});

test('an older free-text address is offered in the street field for splitting up', async ({ page }) => {
  await setup(page);
  await page.goto('/locations/old/edit');
  await expect(field(page, 'Straße und Hausnummer')).toHaveValue('Industriestraße 5, 4020 Linz');
  await expect(page.getByText('Bisherige Adresse')).toBeVisible();
});

test('the location view shows the OpenStreetMap map below the image', async ({ page }) => {
  await setup(page);
  await page.goto('/locations/vienna');
  await expect(page.locator('.details')).toContainText(stephansplatz.address);
  const map = page.locator('aside .card', { hasText: 'Karte' });
  await expect(map.locator('.leaflet-container')).toBeVisible();
  await expect(map.locator('.location-map-marker')).toHaveCount(1);
  await expect(map.locator('.leaflet-control-attribution')).toHaveText('© OpenStreetMap');
  await expect(map.getByRole('link', { name: 'In OpenStreetMap öffnen' })).toHaveAttribute('href', /mlat=48\.208493&mlon=16\.373149/);
  // directly below the gallery
  const order = await page.locator('aside > section').evaluateAll(cards => cards.map(card => card.classList.contains('gallery') ? 'gallery' : card.textContent?.includes('Karte') ? 'map' : 'other'));
  expect(order.indexOf('map')).toBe(order.indexOf('gallery') + 1);

  await page.goto('/locations/plain');
  await expect(page.locator('h1')).toHaveText('Lager ohne Position');
  await expect(page.locator('app-location-map')).toHaveCount(0);
});
