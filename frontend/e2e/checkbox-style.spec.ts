import { expect, test } from '@playwright/test';
import { pageOf } from './support/paging';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    test(`checkboxes share selection styling (${colorScheme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme });
      const asset = { uuid: 'asset', name: 'Atemschutzgerät', areaUuids: [], images: [] };
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        await route.fulfill({
          json:
            path === '/api/auth/me'
              ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
              : path.includes('customization')
                ? { brandName: 'Feuerwehr', brandColor: '#b62f2f', advancedThemeEnabled: false }
                : path === '/api/assets/page'
                  ? pageOf([asset], url)
                  : path === '/api/assets'
                    ? [asset]
                    : [],
        });
      });
      await page.goto('/admin/customization');
      const checkbox = page.locator('input[name="advancedThemeEnabled"]');
      await expect(checkbox).toBeVisible();
      const dimensions = await checkbox.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: style.width,
          height: style.height,
          radius: style.borderRadius,
          border: style.borderColor,
          background: style.backgroundColor,
        };
      });
      await expect(checkbox).toHaveCSS('appearance', 'none');
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toHaveCSS('background-color', 'rgb(182, 47, 47)');
      const checkStyle = await checkbox.evaluate((element) => {
        const style = getComputedStyle(element, '::after');
        return {
          width: style.width,
          height: style.height,
          transform: style.transform,
          mask: style.maskImage,
        };
      });
      expect(checkStyle.width).toBe('14px');
      expect(checkStyle.height).toBe('14px');
      expect(checkStyle.transform).toBe('none');
      expect(checkStyle.mask).toContain('M20');
      await checkbox.screenshot({ path: test.info().outputPath('checked-checkbox.png') });
      expect(
        await checkbox.evaluate((element) => getComputedStyle(element, '::after').visibility),
      ).toBe('visible');
      const selectedBackground = await checkbox.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await checkbox.focus();
      await page.keyboard.press('Space');
      await expect(checkbox).not.toBeChecked();
      await expect(checkbox).toHaveCSS('outline-style', 'solid');
      await checkbox.evaluate((element: HTMLInputElement) => {
        element.indeterminate = true;
      });
      expect(
        await checkbox.evaluate((element) => getComputedStyle(element, '::after').height),
      ).toBe('2px');
      await checkbox.evaluate((element: HTMLInputElement) => {
        element.disabled = true;
      });
      await expect(checkbox).toBeDisabled();
      await expect(checkbox).toHaveCSS('opacity', '0.5');
      await page.screenshot({ path: test.info().outputPath('checkbox-states.png') });

      await page.goto('/assets');
      await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
      const listCheckbox = page.locator('app-selection-checkbox input').first();
      const mark = page.locator('app-selection-checkbox .selection-mark').first();
      await expect(mark).toBeVisible();
      for (const [property, value] of Object.entries(dimensions)) {
        const cssProperty =
          { radius: 'border-radius', border: 'border-top-color', background: 'background-color' }[
            property
          ] ?? property;
        await expect(mark).toHaveCSS(cssProperty, value);
      }
      await listCheckbox.check();
      await expect(mark).toHaveCSS('background-color', selectedBackground);
    });
  }
}
