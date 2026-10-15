# Conventions

## Styling: Use SCSS Variables

Always source reusable presentation values from SCSS. The shared theme is defined in [styles.scss](../frontend/src/styles.scss), primarily as CSS custom properties such as `--surface`, `--text`, `--accent`, `--border`, and radius/shadow/layout tokens. Components consume these with `var(...)`; this project does not require converting runtime theme tokens into Sass `$variables`.

- Reuse the existing token for colors, surfaces, borders, shadows, radii, and shared layout values. Do not repeat literal design colors in component SCSS, HTML, or TypeScript.
- If a required shared token is missing, add it to the central SCSS definitions and use it from components. Do not create a competing theme in a feature.
- Keep component styling in its SCSS file. Use the shared classes for pages, forms, buttons, tables, and dialogs before creating feature variants.
- Use the Sass breakpoint variables and mixins from [_breakpoints.scss](../frontend/src/styles/_breakpoints.scss): `@use 'breakpoints' as bp;` and `@include bp.phone { ... }`.
- User-selected tag/area colors and label coordinates are runtime domain data, not replacement design palettes. Keep their dynamic binding while using SCSS variables for surrounding UI styling.
- Avoid universal `overscroll-behavior: contain`: it previously blocked wheel scrolling over nested elements. Apply scroll containment only to intended scroll boundaries such as dialogs.

Use Lucide components from `@lucide/angular`. Navigation icon choices belong in navigation configuration, not a template if/else chain. Preserve the existing compact administrative UI and responsive navigation.

Dropdown panels use the shared `DropdownPosition` directive with Floating UI and the browser popover top layer. Reuse it for anchored menus so clipping containers, viewport edges, scrolling, and resizing are handled consistently. Shared sizing and spacing tokens remain in SCSS.

## Language and Encoding

Write project documentation and technical identifiers in English. German user-facing text must use correct German characters: **ä, ö, ü, Ä, Ö, Ü, and ß**. Save text as UTF-8. For example, use “Prüfungen”, “löschen”, “größer”, and “Straße”, not “Pruefungen”, “loeschen”, “groesser”, or “Strasse”. Do not use ASCII-only spelling merely to simplify file editing.

Generated machine identifiers are different: the backend deliberately normalizes custom-field keys into a restricted form. Preserve this normalization while displaying the original human-readable name. Do not rename existing API properties, database identifiers, or enum values to localize UI text.

Older code contains inconsistent transliterations. Correct touched user-visible text when relevant, but do not mix a broad language rewrite into unrelated changes.

## Frontend State and Components

Touch selection uses the shared `TouchSelection` coordinator within explicit selection mode: hold for 350 ms, then paint a contiguous range; starting on a selected item deselects the range. Reversing restores items outside the current range to their original state. Near the vertical edges of the actual scroll container it scrolls proportionally, continuing hit-testing as rows move. Quick swipes retain native scrolling. Touch end/cancellation, multi-touch, hiding the page, leaving selection mode, and component destruction stop the gesture. Non-passive document listeners exist only during a pending/active gesture; animation runs outside Angular and selection updates re-enter its zone.

Mutable collection pages share `ListActions`, `SelectableRow`, and `SelectionCheckbox` for multi-selection and batch actions. Selection starts explicitly with "Auswählen"; only that mode shows custom branded checkmarks and intercepts whole-row/card clicks instead of opening or editing entries. Exiting selection clears it and restores normal interaction. Native checkbox semantics and keyboard access remain intact. Shift selects a range in the current filtered order, including other pagination pages. The header checkbox selects the current page; changing filters prunes hidden selections. Delete actions require permission for every selected entry, one confirmation, and sequential calls to the existing authorized delete endpoints. Nested children are deleted before selected parents. Successful deletions are removed from selection; failures stay selected with a visible error. Audit logs and due-date projections are not deletable collections. Pages add further batch actions through the `actions` input of `ListActions`; neutral actions sit above the red "Löschen" entry. The asset list uses this to print labels for the selection with one template and a copy count per asset.

Printouts use the shared `PrintDocument` component (`app-print-document`): it renders the logo/brand name, document kind, large title, `PrintMeta` header entries (what, when, who), optional signature lines, and a page footer with "Seite X von Y". Pages project their own body and may project extra dialog toggles with the `printOptions` attribute; `open()` shows the settings for paper size, orientation, and margins (remembered per browser), then calls the browser print dialog. The sheet is moved into `<body>` so printing hides the app around it. At print time the component paginates itself: it copies the source content into sheets of the chosen paper size whose padding is the page margin, with a running header from page 2 and a footer with the page number. `@page` gets `margin: 0`, so the browser dialog's margin setting cannot remove margins or page numbers. Tables split between rows and repeat their `thead`, headings move along with the following content, and blocks with `break-inside: avoid` (and anything not in the splittable container list) stay together. Copies are static snapshots, so print content must not depend on live bindings after `print()`. Reusable content blocks (`print-section`, `print-table`, `print-stats`, `print-details`, `print-label`, `print-columns`, `print-figure`, `print-gallery`, `print-photos`, `print-muted`, `print-together`, ...) live in `styles.scss`; current documents are the inspection protocol (`InspectionPage`) and the asset data sheet (`AssetPrint` on the asset detail page, with options for images, last inspection, due dates, and linked assets); keep printed content black on white and use `print-alert` (bold) instead of colors for problems.

Location types are a fixed backend enum (`LocationType`); their German names, hints, and Lucide icons live only in `util/location-types.ts`, which the form, list placeholders, location view, and activity log use. Add a type by appending it to both. Location positions: the form keeps the address parts and coordinates as ordinary form fields in its "Position" section; `LocationLookup` only adds the Nominatim buttons, match list, and preview, and `LocationMap` draws the map with Leaflet (also below the image in the location view). Leaflet is loaded with a dynamic import so it stays out of the initial bundle, runs outside the Angular zone, and only moves the marker/view when the coordinates change (after a short pause while they are typed); its CSS is a global style in `angular.json`, so a running `ng serve` must be restarted after changing it. Geocoding always goes through the backend proxy, never directly from the browser.

Use standalone components with local imports and template-driven forms where the existing feature does. Class names use PascalCase, properties/methods camelCase, and component files follow the existing feature's kebab-case names. Respect the UTF-8, two-space, single-quote TypeScript settings in [the editor configuration](../frontend/.editorconfig).

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
