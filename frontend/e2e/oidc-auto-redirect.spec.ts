import { expect, Page, test } from '@playwright/test';

const providers = { oidcEnabled: true, oidcLabel: 'Feuerwehr-SSO', oidcLoginUrl: '/oauth2/authorization/oidc', oidcAutoRedirect: true };

/** Answers like the backend; the identity provider is a plain page so the redirect can be seen. */
async function mockApi(page: Page, options: { loggedIn?: boolean; autoRedirect?: boolean } = {}) {
  let loggedIn = options.loggedIn ?? false;
  const savedOidc: Record<string, unknown>[] = [];
  await page.route('**/oauth2/authorization/oidc', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Identity Provider</h1>' }));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/logout') {
      loggedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/admin/oidc' && request.method() === 'PUT') {
      savedOidc.push(request.postDataJSON());
      return route.fulfill({ json: request.postDataJSON() });
    }
    const body = path === '/api/auth/me'
      ? loggedIn ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] } : { authenticated: false }
      : path === '/api/auth/providers' ? { ...providers, oidcAutoRedirect: options.autoRedirect ?? true }
      : path === '/api/admin/oidc' ? {
        enabled: true, buttonLabel: 'Feuerwehr-SSO', issuerUri: 'https://sso.example.org/realms/feuerwehr', clientId: 'inventorycore',
        clientSecret: null, clientSecretSet: true, scopes: 'openid profile email', usernameClaim: 'preferred_username',
        displayNameClaim: 'name', emailClaim: 'email', groupsClaim: 'groups', autoCreateUsers: true, syncGroups: true,
        crossProviderLogin: false, autoRedirect: false, publicUrl: 'https://inventar.example.org',
      }
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json: body });
  });
  return { savedOidc };
}

test('the login page goes straight to the identity provider', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/oauth2\/authorization\/oidc$/);
  await expect(page.getByRole('heading', { name: 'Identity Provider' })).toBeVisible();
});

test('?direct=1 shows the normal login page', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login?direct=1');
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Feuerwehr-SSO/ })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/login\?direct=1$/);
});

test('default login is concise and configured login messages remain visible', async ({ page }) => {
  await mockApi(page, { autoRedirect: false });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Anmelden', exact: true })).toBeVisible();
  await expect(page.locator('.brand-text, aside.brand, .subtitle')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
  await page.route('**/api/customization', route => route.fulfill({ json: {
    loginTitle: 'Anmeldung Gerätehaus',
    loginMessage: 'Zugang nur für Mitglieder.',
  } }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Anmeldung Gerätehaus' })).toBeVisible();
  await expect(page.locator('.subtitle')).toHaveText('Zugang nur für Mitglieder.');
});

test('a failed SSO login does not redirect again', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login?error=oidc_failed');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/login\?error=oidc_failed$/);
});

test('without the setting the form stays', async ({ page }) => {
  await mockApi(page, { autoRedirect: false });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/login$/);
});

test('after the logout the login page stays instead of signing in again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, { loggedIn: true });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Benutzermenü', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Abgemeldet');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/login$/);
});

test('admins switch the redirect on in the OIDC settings', async ({ page }) => {
  const { savedOidc } = await mockApi(page, { loggedIn: true });
  await page.goto('/admin/oidc');
  await expect(page.getByText('https://inventar.example.org/login?direct=1')).toHaveCount(0);
  await page.getByRole('checkbox', { name: /Automatisch zum Identity Provider weiterleiten/ }).check();
  await expect(page.getByText('https://inventar.example.org/login?direct=1')).toBeVisible();
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect.poll(() => savedOidc.length).toBe(1);
  expect(savedOidc[0]['autoRedirect']).toBe(true);
});
