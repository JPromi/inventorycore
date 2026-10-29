import { expect, Page, test } from '@playwright/test';

async function mockApi(
  page: Page,
  emailAvailable = false,
  emailAddress: string | null = 'operator@example.org',
) {
  let read = false;
  let preferences = {
    inbox: true,
    email: false,
    push: false,
    daysBefore: 7,
    overdueInbox: true,
    overdueEmail: false,
    overduePush: false,
    emailAddress,
    emailAvailable,
    pushPublicKey: 'test-key',
  };
  const saved: Record<string, unknown>[] = [];
  const message = {
    uuid: 'notice-1',
    title: 'Prüfung überfällig',
    body: 'HLF 20: Jahresprüfung.',
    assetUuid: 'asset-1',
    createdAt: '2026-10-28T08:00:00Z',
    readAt: null,
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/notifications/notice-1/read') {
      await new Promise((resolve) => setTimeout(resolve, 150));
      read = true;
      return route.fulfill({ status: 200, body: '' });
    }
    if (path === '/api/notifications') {
      return route.fulfill({
        json: [{ ...message, readAt: read ? '2026-10-29T08:00:00Z' : null }],
      });
    }
    if (path === '/api/notifications/preferences') {
      if (route.request().method() === 'PUT') {
        await new Promise((resolve) => setTimeout(resolve, 150));
        preferences = { ...preferences, ...route.request().postDataJSON() };
        saved.push(route.request().postDataJSON());
      }
      return route.fulfill({ json: preferences });
    }
    if (path === '/api/admin/notifications') {
      if (route.request().method() === 'PUT') {
        saved.push(route.request().postDataJSON());
      }
      return route.fulfill({
        json: {
          enabled: true,
          host: 'smtp.example.org',
          port: 587,
          username: 'sender',
          password: null,
          passwordConfigured: true,
          fromAddress: 'sender@example.org',
          startTls: true,
        },
      });
    }
    const json =
      path === '/api/auth/me'
        ? {
            authenticated: true,
            uuid: 'operator',
            username: 'operator',
            displayName: 'Operator',
            role: 'ADMIN',
            permissions: [],
          }
        : path === '/api/areas'
          ? [{ uuid: 'area', name: 'Feuerwehr', defaultArea: true }]
          : [];
    return route.fulfill({ json });
  });
  return saved;
}

test('inbox updates read state and badge after delayed response and hides unconfigured email', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Prüfung überfällig' })).toBeVisible();
  await expect(page.locator('nav .notification-count')).toHaveText('1');
  await expect(page.getByText('Per E-Mail erinnern', { exact: true })).toHaveCount(0);
  await expect(page.locator('app-notification-settings')).toHaveCount(0);
  await expect(page.locator('nav .nav-list a[href="/notifications"]')).toHaveCount(0);
  const accountBell = page.locator('app-user-menu .account-controls a[href="/notifications"]');
  await expect(accountBell).toBeVisible();
  await expect(accountBell).toHaveClass(/active/);
  const row = page.locator('app-user-menu .account-controls');
  const userButton = await row.locator('button.user').boundingBox();
  const bell = await accountBell.boundingBox();
  expect(
    Math.abs(userButton!.y + userButton!.height / 2 - bell!.y - bell!.height / 2),
  ).toBeLessThan(2);
  await page.getByRole('button', { name: 'Als gelesen markieren' }).click();
  await expect(page.getByText('Gelesen', { exact: true })).toBeVisible();
  await expect(page.locator('nav .notification-count')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Asset öffnen' })).toHaveAttribute(
    'href',
    '/assets/asset-1',
  );
});

test('saves different channels for upcoming and overdue reminders', async ({ page }) => {
  const saved = await mockApi(page, true);
  await page.goto('/profile');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Push', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'E-Mail', exact: true })).toBeVisible();
  await page.locator('input[name=email]').check();
  await page.locator('input[name=overduePush]').check();
  await page.locator('input[name=days]').fill('14');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Einstellungen gespeichert.');
  expect(saved[0]).toMatchObject({
    email: true,
    overdueEmail: false,
    push: false,
    overduePush: true,
    daysBefore: 14,
  });
});

test('profile matrix hides email column without configured delivery and fits a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/profile');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'E-Mail', exact: true })).toHaveCount(0);
  await expect(page.getByRole('rowheader', { name: 'Bevorstehende Prüfungen' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Überfällige Prüfungen' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('email needs both a configured server and an address; profile controls use shared styles', async ({
  page,
}) => {
  const saved = await mockApi(page, true, null);
  await page.goto('/profile');
  const email = page.getByRole('checkbox', {
    name: 'Bevorstehende Prüfungen per E-Mail',
    exact: true,
  });
  await expect(email).toBeDisabled();
  await expect(page.getByRole('columnheader', { name: 'Posteingang', exact: true })).toBeVisible();
  const address = page.getByRole('textbox', { name: 'Empfängeradresse' });
  await expect(address).toBeVisible();
  await address.fill('operator@example.org');
  await expect(email).toBeEnabled();
  await email.check();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Einstellungen gespeichert.');
  expect(saved[0]).toMatchObject({ email: true, emailAddress: 'operator@example.org' });
  const styles = await address.evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, radius: style.borderRadius };
  });
  expect(styles.height).toBeGreaterThanOrEqual(37);
  expect(styles.radius).not.toBe('0px');
  await page
    .locator('app-notification-settings')
    .screenshot({ path: 'test-results/notification-settings.png' });
  await address.fill('');
  await expect(email).toBeDisabled();
  await expect(email).not.toBeChecked();
});

test('admin SMTP form preserves saved password and exposes sender configuration', async ({
  page,
}) => {
  const saved = await mockApi(page);
  await page.goto('/admin/notifications');
  await expect(page.getByRole('heading', { name: 'E-Mail-Versand' })).toBeVisible();
  await expect(page.locator('input[name=password]')).toHaveValue('');
  await page.locator('input[name=from]').fill('feuerwehr@example.org');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Einstellungen gespeichert.');
  expect(saved[0]).toMatchObject({ password: null, fromAddress: 'feuerwehr@example.org' });
});

test('mobile navigation exposes the notification icon', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/notifications');
  await expect(
    page.locator('.mobile-bar').getByRole('link', { name: 'Benachrichtigungen' }),
  ).toBeVisible();
  await expect(page.locator('.mobile-title')).toHaveText('Benachrichtigungen');
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});
