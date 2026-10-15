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

## Browser Regressions

`touch-selection.spec.ts` uses touch-enabled Edge and CDP touch input to cover hold/drag/reverse selection, deselection, edge auto-scroll in list/grid views, stopping on release/cancellation, and native quick-swipe scrolling. These browser regressions do not replace a physical iPhone/Safari check.

Backend: `PagingTest` covers page slicing, size limits, search words and the area-selection rule (including location chains and cycles); `PermissionRulesTest` covers the server-side rules that the UI mirrors: no scans or checks of assets outside the user's inspect areas, protocol details without hidden assets, deleting open protocols, template areas, attaching and reading files, and upload rights.

`list-selection.spec.ts` covers shared multi-selection across inventory, tags, label/inspection templates, protocols, and admin user/group/area lists. It exercises explicit selection mode, hidden inactive controls, whole-row/card clicks, restoring navigation on exit, keyboard selection, Shift ranges, selecting all loaded entries and indeterminate state, loading the next page by scrolling and selecting across loaded pages, server search with the total in the header, grid/mobile menus, selection pruning after a new search, cancellation, permission restrictions, partial failures, child-before-parent deletion, and batch label printing (template, copies per asset, print pages). APIs are mocked; existing backend delete authorization remains authoritative.

```sh
npm run test:e2e
```

Playwright reads [playwright.config.ts](../frontend/playwright.config.ts), uses installed Microsoft Edge, blocks service workers, and starts or reuses the Angular server on `127.0.0.1:4201`. CI does not reuse an existing server. Edge must be available; downloading Playwright Chromium alone does not satisfy the configured `msedge` channel.

`print-document.spec.ts` prints a mocked asset data sheet (details, images, last inspection, due dates, linked assets, and the dialog options that leave images and the inspection out) and a mocked multi-page inspection protocol with a stubbed `window.print`: it checks the print settings dialog, the branded header and meta data, that only the generated pages are visible in print media, margins/header/footer and "Seite X von Y" on every page, repeated table headers, no overflowing page content, a PDF rendered with zero browser margins having exactly one PDF page per generated page, the document title used for PDF file names, and cleanup after `afterprint`.

`location-types.spec.ts` covers choosing the location type in the form (header icon, saved value) and the type icons/names in the location list and view, including older locations without a type. `location-coordinates.spec.ts` covers the split address fields in the location form (styled like the other inputs), coordinates from the address with a choice between several matches, address parts from coordinates, validation that blocks saving incomplete or out-of-range coordinates, older free-text addresses, and the Leaflet map below the image in the location view (marker, attribution, the same map element while other fields change, marker moves without intermediate values). Geocoding and map tiles are mocked. A reused `ng serve` on port 4201 started before a change to global styles in `angular.json` serves the old styles; restart it. Backend: `GeocodingServiceTest` (Nominatim parameters/User-Agent, address parts, caching, errors, coordinate validation) and `GeocodingControllerTest` (access rules).

[The current regression suite](../frontend/e2e/zone-updates.spec.ts) mocks API responses and verifies LDAP loading, connection results, sync success/error after confirmation, and user-list refresh after deletion without a follow-up click. These tests do not contact a real backend or identity provider.

Dropdown regression tests also cover viewport-edge positioning, list scrolling, and selection for search, multi-select, area, and color panels at desktop and mobile sizes.

For async UI changes, assert the final DOM after delayed responses without injecting an extra click or manual change-detection call. For permissions and persistence changes, prioritize backend checks. Documentation-only changes need link/command validation, not a database-backed application restart.
