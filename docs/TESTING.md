# Testing

## Backend

JUnit Jupiter and Mockito are available through Spring Boot test starters. Tests live under `backend/src/test/java` and cover image processing, LDAP synchronization/referrals, provider settings, profile uploads, inspection scheduling, and activity logging.

From `backend/` on Windows:

```powershell
.\gradlew.bat test
.\gradlew.bat test --tests 'com.jpromi.inventorycore.ldap.*'
```

Use `./gradlew` on Unix. Results are written to `build/reports/tests/test/` and `build/test-results/test/`.

`InventorycoreApplicationTests` uses `@SpringBootTest`. No dedicated test datasource, embedded database, or Testcontainers setup is checked in. A full run therefore needs the configured PostgreSQL database and can execute schema/default-data initializers. Mock-based unit tests can be selected independently.

LDAP tests mock directory access; they do not prove connectivity to an actual LDAP server. Preserve cases for failed/incomplete searches, continuation references, direct DN verification before deletion, provider isolation, and interval boundaries.

## Frontend Unit Tests

The Angular unit-test builder uses Vitest and jsdom. Component specs live beside their components.

From `frontend/`:

```sh
npm test -- --watch=false
```

Known baseline: this command fails during compilation in the existing login-page spec. It has an outdated service import, Jasmine-style `spyOn` calls, and direct access to protected component members. This was verified while preparing this documentation; it is not a passing test suite. Correct these tests in a separate application/test maintenance task rather than hiding the failure.

## Texts

From `frontend/`, `npm run i18n:check` verifies that every literal text key used in templates and TypeScript (`'key' | t`, `t('key')`, `tn(...)`) exists in `public/i18n/de.json`; keys built at runtime are not covered. Unit tests that render components without the texts see the keys instead; call `setTranslations()` from `core/i18n/i18n` in such specs. Browser regressions load the real `de.json` from the dev server, so their text assertions follow the current German wording.

## Browser Regressions

`inventory-tree.spec.ts` covers switching between default flat list, grid and explicit tree view, parent-first asset/location ordering, child and grandchild indentation, connector lines, relationship notes, visual-order Shift ranges, child-only search results, and a parent arriving on a later page. It also checks orphan, self-reference and cycle handling. Run with list/touch-selection regressions after changing the hierarchy presentation.

`pwa-print.spec.ts` emulates iPhone/iPad standalone indicators in Edge and verifies real local PDF generation, page/copy counts, nonblank page rasters, gesture-bound file sharing, cancelled/failed share attempts and the download-only fallback. This is not a physical iOS/AirPrint test. On a real home-screen installation, test both an asset/protocol and labels: Print prepares a PDF, then PDF teilen opens the native share sheet; choose Drucken there, or download/save the PDF. Verify printer paper size and barcode readability on actual labels. Browser/Android printing continues to use the existing print calls.

`theme.spec.ts` covers default and live system appearance, per-user overrides across reloads, account isolation, unavailable browser storage, advanced light/dark branding, independent logo changes, fallback when advanced mode is disabled, anonymous dark login, light label logos and light print-document colors. Check screenshots on desktop/mobile and rerun after palette changes. Restart a reused dev server if it is no longer watching source changes; a production build alone does not update an already stale server.

Dark-mode verification passed the full 72-test browser suite and 14 focused backend tests (`CustomizationServiceTest`, `CustomizationSecurityTest`). Production build, translation keys and formatting checks also passed. This does not exercise the Hibernate column update against a live PostgreSQL database.

After the feature/shared/layout migration, `refactoring-regressions.spec.ts` covers the `/dashboard` route and the brand link to it, cancelled stale detail responses during linked navigation, and retrying group membership saves without duplicating the group or repeating successful updates. The complete 66-test Edge suite passed during the refactor, including image previews, print pagination, map rendering, dropdown positioning and touch selection. The focused `InventoryListServiceTest` and `PagingTest` suites passed 12 tests, including skipping usage scans on out-of-range tag pages. These are regression results, not performance benchmarks.

`touch-selection.spec.ts` uses touch-enabled Edge and CDP touch input to cover hold/drag/reverse selection, deselection, edge auto-scroll in list/grid views, stopping on release/cancellation, and native quick-swipe scrolling. These browser regressions do not replace a physical iPhone/Safari check.

Backend: `PagingTest` covers page slicing, size limits, search words and the area-selection rule (including location chains and cycles); `PermissionRulesTest` covers the server-side rules that the UI mirrors: no scans or checks of assets outside the user's inspect areas, protocol details without hidden assets, ambiguous scan codes (nothing recorded, only a matching choice accepted), deleting open protocols, template areas, attaching and reading files, and upload rights.

`dashboard.spec.ts` covers the start page with a mocked `/api/dashboard`: number tiles linking to the lists, overdue/due entries and recent inspections with their result, the type bars, result legend and tags, reloading with the `areas` of a new sidebar selection, and hiding the inspection parts without the right to inspect. Backend: `DashboardServiceTest` covers the area rule through an asset's location, tags counted once per asset, assets without type, no inspection data without the inspect right, and due dates/inspections/results limited to the selection and time windows.

`splash.spec.ts` covers the start screen of `index.html` (visible while the texts load, removed after the bootstrap, remembered brand name and color) and the `<noscript>` page with JavaScript disabled.

`list-selection.spec.ts` covers shared multi-selection across inventory, tags, label/inspection templates, protocols, and admin user/group/area lists. It exercises explicit selection mode, hidden inactive controls, whole-row/card clicks, restoring navigation on exit, keyboard selection, Shift ranges, selecting all loaded entries and indeterminate state, loading the next page by scrolling and selecting across loaded pages, server search with the total in the header, grid/mobile menus, selection pruning after a new search, cancellation, permission restrictions, partial failures, child-before-parent deletion, and batch label printing (template, copies per asset, print pages). APIs are mocked; existing backend delete authorization remains authoritative.

```sh
npm run test:e2e
```

Playwright reads [playwright.config.ts](../frontend/playwright.config.ts), uses installed Microsoft Edge, blocks service workers, and starts or reuses the Angular server on `127.0.0.1:4201`. CI does not reuse an existing server. Edge must be available; downloading Playwright Chromium alone does not satisfy the configured `msedge` channel.

`print-document.spec.ts` prints a mocked asset data sheet (details, images, last inspection, due dates, linked assets, and the dialog options that leave images and the inspection out) and a mocked multi-page inspection protocol with a stubbed `window.print`: it checks the print settings dialog, the branded header and meta data, that only the generated pages are visible in print media, margins/header/footer and "Seite X von Y" on every page, repeated table headers, no overflowing page content, a PDF rendered with zero browser margins having exactly one PDF page per generated page, the document title used for PDF file names, and cleanup after `afterprint`.

`ambiguous-scan.spec.ts` covers a code that matches two assets: in an inspection the message lists both (matched field, inventory id, location, "In dieser Prüfung"), nothing is checked until one is picked, and the repeated scan carries the chosen asset; the scan page shows both results with the field that matched.

`location-types.spec.ts` covers choosing the location type in the form (header icon, saved value) and the type icons/names in the location list and view, including older locations without a type. `location-coordinates.spec.ts` covers the split address fields in the location form (styled like the other inputs), coordinates from the address with a choice between several matches, address parts from coordinates, validation that blocks saving incomplete or out-of-range coordinates, older free-text addresses, and the Leaflet map below the image in the location view (marker, attribution, the same map element while other fields change, marker moves without intermediate values). Geocoding and map tiles are mocked. A reused `ng serve` on port 4201 started before a change to global styles in `angular.json` serves the old styles; restart it. Backend: `GeocodingServiceTest` (Nominatim parameters/User-Agent, address parts, caching, errors, coordinate validation) and `GeocodingControllerTest` (access rules).

[The current regression suite](../frontend/e2e/zone-updates.spec.ts) mocks API responses and verifies LDAP loading, connection results, sync success/error after confirmation, and user-list refresh after deletion without a follow-up click. These tests do not contact a real backend or identity provider.

Dropdown regression tests also cover viewport-edge positioning, list scrolling, and selection for search, multi-select, area, and color panels at desktop and mobile sizes.

For async UI changes, assert the final DOM after delayed responses without injecting an extra click or manual change-detection call. For permissions and persistence changes, prioritize backend checks. Documentation-only changes need link/command validation, not a database-backed application restart.

The Playwright suite runs against the Angular dev server, which resolves CommonJS packages differently from the production build. Leaflet 1.x is such a package: `LocationMap` takes it from the module's `default` export when present, because in the production build `import('leaflet')` only provides it there (otherwise the built app failed with "Cannot read properties of undefined (reading 'mobile')" and showed no map). After changing how such packages are imported, check the built app (`npm run build`, then serve `dist/inventorycore/browser` with an SPA fallback) and not only the dev server.

`laser-datamatrix.spec.ts` feeds the browser's fake camera with `e2e/fixtures/laser-datamatrix.mjpeg`, a small Data Matrix code lasered into black plastic (light on dark, little contrast, blur, noise), and checks that the scan page reads it through the whole camera pipeline including the zxing-wasm WebAssembly file. The camera passes in `CameraScanner` (whole frame inverted/rotated, centre with a global threshold, enlarged centre, contrast-stretched centre) were chosen by decoding generated images of such codes; a code differing from its background by only about 16 grey levels under noise was not readable with any setting, so very faint markings still need light from the side.
