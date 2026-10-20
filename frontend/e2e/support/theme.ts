import { Page } from '@playwright/test';

/**
 * The app is light unless a mode was chosen. Tests of the dark look choose "System" for the
 * guest and the mocked admin, so `page.emulateMedia({ colorScheme })` decides the mode again.
 */
export async function followSystemTheme(page: Page, usernames: string[] = ['admin']): Promise<void> {
  await page.addInitScript((names: string[]) => {
    for (const key of ['inventorycore.theme.guest', ...names.map((name) => `inventorycore.theme.user.${name}`)]) {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, 'system');
      }
    }
  }, usernames);
}
