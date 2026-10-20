# Conventions

## Styling: Use SCSS Variables

Always source reusable presentation values from SCSS. The shared theme is defined in [styles.scss](../frontend/src/styles.scss), primarily as CSS custom properties such as `--surface`, `--text`, `--accent`, `--border`, and radius/shadow/layout tokens. Components consume these with `var(...)`; this project does not require converting runtime theme tokens into Sass `$variables`.

- Reuse the existing token for colors, surfaces, borders, shadows, radii, and shared layout values. Do not repeat literal design colors in component SCSS, HTML, or TypeScript.
- If a required shared token is missing, add it to the central SCSS definitions and use it from components. Do not create a competing theme in a feature.
- Keep component styling in its SCSS file. Use the shared classes for pages, forms, buttons, tables, and dialogs before creating feature variants.
- Write multiline SCSS with one declaration per line, and nest related elements and states under their owning selector, normally inside `:host { ... }`. Keep nesting shallow and purposeful; use `&:hover`, `&.active`, and child selectors rather than repeating long selector chains. Do not add empty host blocks or introduce `@extend` across unrelated components just to simulate inheritance.
- Keep `@use`/`@forward`, shared mixins, and keyframes at the appropriate top level. Global print styles (`PrintDocument`, whose sheet moves into `body`) and Leaflet styles (`ViewEncapsulation.None`) must retain their explicit global wrapper selectors, not a host ancestor. The large inspection page keeps component-encapsulated sibling rules to avoid duplicating host prefixes past its CSS budget; extract a real presentation component before growing it further. Do not raise style budgets to hide selector growth.
- Use the Sass breakpoint variables and mixins from [_breakpoints.scss](../frontend/src/styles/_breakpoints.scss): `@use 'breakpoints' as bp;` and `@include bp.phone { ... }`.
- User-selected tag/area colors and label coordinates are runtime domain data, not replacement design palettes. Keep their dynamic binding while using SCSS variables for surrounding UI styling.
- Avoid universal `overscroll-behavior: contain`: it previously blocked wheel scrolling over nested elements. Apply scroll containment only to intended scroll boundaries such as dialogs.

Use Lucide components from `@lucide/angular`. Navigation icon choices belong in navigation configuration, not a template if/else chain. Preserve the existing compact administrative UI and responsive navigation.

Dropdown panels use the shared `DropdownPosition` directive with Floating UI and the browser popover top layer. Reuse it for anchored menus so clipping containers, viewport edges, scrolling, and resizing are handled consistently. Shared sizing and spacing tokens remain in SCSS.

Image previews use the shared `ImageViewerService.open(images, index)`. The single `ImageViewer` in the app shell opens a native modal dialog in the browser top layer, including above other dialogs. Pass full-size URLs and optional thumbnails, filenames, and alt texts. It supports previous/next navigation, keyboard arrows/Escape, zoom buttons/wheel/double-click, panning, and touch pinch/swipe. Navigation resets the zoom; route changes close the viewer. Use buttons for image triggers so keyboard access remains available.

## Appearance

Light/dark semantic palettes live in `frontend/src/styles/_themes.scss`, applied from `styles.scss`; components still consume the same shared variables. `ThemeService` resolves the system preference unless explicitly overridden and updates on live media-query changes. Reuse `ThemeSelector` in the user menu/profile rather than storing another theme state. Overrides are stored per user UUID (username fallback) in this browser; anonymous pages use a separate guest key. Selecting System removes the override. Storage failures keep appearance usable; cross-tab storage changes are observed. This is not cross-device account synchronization. Before Angular starts, CSS follows the system preference.

`CustomizationService.logoUrl` selects screen branding; do not read the raw light `settings.logoUrl` for navigation/login. Admin branding edits light by default, exposing separate light/dark editors only through the persisted advanced checkbox. Print documents and labels intentionally use the raw light logo/color and light palette regardless of screen theme. Keep native controls' `color-scheme` aligned with the effective theme and recompute brand-button text contrast when either the palette or brand color changes.

Use `--accent` for actual brand fills and `--accent-foreground` for brand-colored text/icons on neutral surfaces. The dark palette lightens the latter toward the regular text color so even a near-black configured brand color remains visible; button fills and their automatically contrasted `--on-accent` text retain the configured color.

## Lists: Paging and Server Search

Every list page loads its entries from a `GET /api/<resource>/page` endpoint, 50 at a time (`PAGE_SIZE`), and loads the next page while scrolling. Rules:

- Search, filters and the sidebar area selection run on the server (`q`, resource filters, repeated `areas`), never on the loaded entries in the browser. Every search word must occur in one of the searched fields (case-insensitive).
- The server filters by permissions first, then by area selection, filters and search, sorts, and maps only the requested page (`Paging` in the backend). `total` and `hasMore` therefore never count hidden objects. Area selection uses the same rule as before in the UI: assets and locations also match through their location / parent locations; types, templates and protocols without areas match every selection.
- Numbers a page shows next to the list (tab counts, tag usage, group members) come with the page response; do not load complete lists just to count.
- In the frontend, use `PagedList` (`util/paged-list.ts`) for the items and `InfiniteScroll` (`appInfiniteScroll` on a `.list-end` element after the list) for loading more; debounce typing with `SEARCH_DELAY_MS` and reload right away for other filters and the sidebar areas (`areaService.selected$`, skipping its initial value). Show the server `total` in the header.
- The plain list endpoints (`GET /api/assets` etc.) stay for pickers and lookups that need everything (location tree, parent asset, filter options); they apply the same permission filter.
- Browser tests mock `/page` endpoints with `e2e/support/paging.ts`.

## Language and Texts

Write project documentation and technical identifiers in English. The user interface is German for now, but every user-visible text goes through i18n so further languages only need another JSON file.

### i18n

- Texts live in [frontend/public/i18n/de.json](../frontend/public/i18n/de.json), loaded at runtime by `main.ts` before the app modules are imported (`loadTranslations`, `core/i18n/i18n.ts`). Another language is another `<lang>.json` with the same keys; no rebuild is needed to change a text.
- Never write user-visible text directly into templates or TypeScript. Templates use the pure pipes `{{ 'common.save' | t }}`, `{{ 'inventory.deleted' | t: { name: item.name } }}` and `{{ 'assets.selected' | tn: count }}`; TypeScript uses `t()` / `tn()` from `core/i18n/i18n`. Because the texts are loaded first, `t()` also works in constants such as navigation and form configurations.
- Keys are dotted camelCase paths grouped by feature (`inspections.page.scanPlaceholder`). Reuse `common.*` (actions, generic errors), `terms.*` (domain nouns such as Asset, Standort, Prüfung) and enum texts such as `inspectionStatus.<STATUS>` instead of duplicating them. Placeholders are `{name}`; plurals use `<key>.one` / `<key>.other` with `{count}`. Do not build sentences by concatenating translated fragments; put the whole sentence with placeholders into one text.
- Keys built at runtime (`'inspectionStatus.' + status`) must exist for every possible value. `npm run i18n:check` reports every literal key used in the sources that is missing in `de.json`; run it with the build.
- Data entered by users (names, custom field labels, tag names) and values from the database are never translated.
- Backend messages that reach the user (for example `ResponseStatusException` reasons shown after a failed save) are German only for now. Prefer showing a frontend text chosen by status code or outcome (as the inspection scan does with its `outcome`) and use the server message only as detail.

### Tone and Wording

- Formal, factual German in the impersonal style; where the user must be addressed, use "Sie" (never "du"). Prefer neutral instructions such as "Bitte einen Standort auswählen." over direct address.
- Use precise terms instead of colloquial ones: "Vorhanden" / "Nicht vorhanden" instead of "Da" / "Fehlt", "Defekt" instead of "kaputt", "Funktionsfähig" instead of "geht". Keep one term per concept (see `terms.*`, `inspectionStatus.*`, `inspectionCondition.*`).
- Example values in placeholders, hints and sample data are general and preferably from the fire-service domain, e.g. "z. B. Atemschutzgerät", "z. B. HLF 20", "z. B. Gerätehaus › Fahrzeughalle", "z. B. FW-2026-0042", "z. B. Atemschutz, Wasserführung". Do not use company-specific or IT-only examples (EDV, Laptop, firma.local) unless the field is technical (LDAP DNs, URLs), where neutral domains such as `example.org` are used.
- Typography: "z. B." with a space, the ellipsis "…" for pending states and placeholders, German quotation marks „…“.

### Encoding

German user-facing text must use correct German characters: **ä, ö, ü, Ä, Ö, Ü, and ß**. Save text as UTF-8. For example, use “Prüfungen”, “löschen”, “größer”, and “Straße”, not “Pruefungen”, “loeschen”, “groesser”, or “Strasse”. This also applies to backend messages, log texts shown in the UI, and test expectations. Do not use ASCII-only spelling merely to simplify file editing.

Generated machine identifiers are different: the backend deliberately normalizes custom-field keys into a restricted form. Preserve this normalization while displaying the original human-readable name. Do not rename existing API properties, database identifiers, or enum values to localize UI text.

## Frontend State and Components

Touch selection uses the shared `TouchSelection` coordinator within explicit selection mode: hold for 350 ms, then paint a contiguous range; starting on a selected item deselects the range. Reversing restores items outside the current range to their original state. Near the vertical edges of the actual scroll container it scrolls proportionally, continuing hit-testing as rows move. Quick swipes retain native scrolling. Touch end/cancellation, multi-touch, hiding the page, leaving selection mode, and component destruction stop the gesture. Non-passive document listeners exist only during a pending/active gesture; animation runs outside Angular and selection updates re-enter its zone.

Mutable collection pages share `ListActions`, `SelectableRow`, and `SelectionCheckbox` for multi-selection and batch actions. Selection starts explicitly with "Auswählen"; only that mode shows custom branded checkmarks and intercepts whole-row/card clicks instead of opening or editing entries. Exiting selection clears it and restores normal interaction. Native checkbox semantics and keyboard access remain intact. Shift selects a range in the current order of the loaded entries. The header checkbox ("Alle geladenen auswählen") selects all loaded entries; a new search or filter reloads the list and prunes selections that are no longer loaded. Batch deletion removes the deleted entries from the loaded list instead of reloading, so failures stay selected. Delete actions require permission for every selected entry, one confirmation, and sequential calls to the existing authorized delete endpoints. Nested children are deleted before selected parents. Successful deletions are removed from selection; failures stay selected with a visible error. Audit logs and due-date projections are not deletable collections. Pages add further batch actions through the `actions` input of `ListActions`; neutral actions sit above the red "Löschen" entry. The asset list uses this to print labels for the selection with one template and a copy count per asset.

Printouts use the shared `PrintDocument` component (`app-print-document`): it renders the logo/brand name, document kind, large title, `PrintMeta` header entries (what, when, who), optional signature lines, and a page footer with "Seite X von Y". Pages project their own body and may project extra dialog toggles with the `printOptions` attribute; `open()` shows the settings for paper size, orientation, and margins (remembered per browser), then calls the browser print dialog. The sheet is moved into `<body>` so printing hides the app around it. At print time the component paginates itself: it copies the source content into sheets of the chosen paper size whose padding is the page margin, with a running header from page 2 and a footer with the page number. `@page` gets `margin: 0`, so the browser dialog's margin setting cannot remove margins or page numbers. Tables split between rows and repeat their `thead`, headings move along with the following content, and blocks with `break-inside: avoid` (and anything not in the splittable container list) stay together. Copies are static snapshots, so print content must not depend on live bindings after `print()`. Reusable content blocks (`print-section`, `print-table`, `print-stats`, `print-details`, `print-label`, `print-columns`, `print-figure`, `print-gallery`, `print-photos`, `print-muted`, `print-together`, ...) live in `styles.scss`; current documents are the inspection protocol (`InspectionPage`) and the asset data sheet (`AssetPrint` on the asset detail page, with options for images, last inspection, due dates, and linked assets); keep printed content black on white and use `print-alert` (bold) instead of colors for problems.

Location types are a fixed backend enum (`LocationType`); their German names, hints, and Lucide icons live only in `util/location-types.ts`, which the form, list placeholders, location view, and activity log use. Add a type by appending it to both. Location positions: the form keeps the address parts and coordinates as ordinary form fields in its "Position" section; `LocationLookup` only adds the Nominatim buttons, match list, and preview, and `LocationMap` draws the map with Leaflet (also below the image in the location view). Leaflet is loaded with a dynamic import so it stays out of the initial bundle, runs outside the Angular zone, and only moves the marker/view when the coordinates change (after a short pause while they are typed); its CSS is a global style in `angular.json`, so a running `ng serve` must be restarted after changing it. Geocoding always goes through the backend proxy, never directly from the browser.

Use standalone components with local imports and template-driven forms where the existing feature does. Class names use PascalCase, properties/methods camelCase, and component files follow the existing feature's kebab-case names. Respect the UTF-8, two-space, single-quote TypeScript settings in [the editor configuration](../frontend/.editorconfig).

Place new pages and feature-specific data access in `features/<domain>`, reusable controls in `shared/components`, and the navigation shell in `layout`. Keep only cross-application infrastructure in `core`; see [architecture](ARCHITECTURE.md). Share an existing interface instead of redeclaring it, and do not duplicate inherited tags or fields as directly owned values. Long-lived subscriptions and initialization requests must use `takeUntilDestroyed(DestroyRef)` (after flattening operators) or an equivalent complete teardown. Cancel superseded detail/search requests so older responses cannot replace current route state. Format touched code as readable multiline blocks; avoid one-line methods and style rules.

Use ordinary class fields and RxJS subscriptions for page/form state. Retain zone-based change detection: `provideZoneChangeDetection()` in [app.config.ts](../frontend/src/app/app.config.ts) and `polyfills: ["zone.js"]` in [angular.json](../frontend/angular.json). A `main.ts` import alone does not inform the Angular build to transform native async functions. Do not replace this with per-page manual `detectChanges()` calls or signals to mask a global configuration problem.

Reuse route-data configuration for inventory lists/forms and shared search/multi-select/upload controls. Keep Java DTOs and TypeScript interfaces aligned. Async success, failure, and loading states must update without an extra click; see [browser tests](TESTING.md).

## Java and Persistence

Follow the existing `com.jpromi.inventorycore` package layout, constructor injection, Lombok entity patterns, and DTO records/builders. Keep numeric persistence IDs internal and expose UUIDs in transport contracts.

Reuse permission checks, image processing, mapping, and audit helpers. Match the existing local transaction boundary rather than adding a second persistence workflow. When deleting relationships, update the owning association and account for cascades/soft deletion; see [database](DATABASE.md).

## Errors and Logging

Use the local HTTP error conventions rather than introducing an unrelated global envelope. Do not display success after a failed operation. Use SLF4J parameterized logging in Java and avoid logging credentials or provider secrets.

Activity logs use enum actions, object types, and structured `AuditDetail` event/diff data. Translate these for the UI in `audit-text.ts`; do not replace structured audit data with preformatted German prose. Keep secret fields excluded from diffs.

## Documentation Changes

Keep [AGENTS.md](../AGENTS.md) short. Put specialized guidance in its owning document and link to it. Describe implemented behavior, identify uncertainties, and avoid inventing historical decisions or production infrastructure. Record a future architectural decision only when there is evidence of its context and acceptance; see [decision records](decisions/README.md).
