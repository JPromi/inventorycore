import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

/**
 * README screenshots against a running instance filled by `seed.mjs` (not part of the tests).
 * README_URL defaults to http://localhost:8091; the images go to docs/screenshots.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'readme.spec.ts',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env['README_URL'] ?? 'http://localhost:8091',
    channel: 'msedge',
    serviceWorkers: 'block',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    colorScheme: 'light',
    // the phone shot scans a lasered Data Matrix code from a fake camera (FW-2026-0042)
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${join(__dirname, '..', 'e2e', 'fixtures', 'laser-datamatrix.mjpeg')}`,
      ],
    },
  },
});
