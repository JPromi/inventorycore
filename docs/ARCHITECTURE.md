# Architecture

## System Boundaries

The browser runs a standalone Angular SPA. Angular services call the Spring MVC REST API over HTTP using a session cookie. Spring Data JPA repositories persist to PostgreSQL. Image bytes for inventory uploads live on disk, with metadata in the database.

Local development uses Angular's proxy for `/api`, `/oauth2`, and `/login/oauth2`. In the container image the backend serves the built Angular app itself (`SpaWebConfig`), so browser, API, and OIDC paths share one origin; see [deployment](DEPLOYMENT.md).

## Frontend

- `app.routes.ts` defines guarded routes, lazy-loaded feature pages, and reusable inventory page/form configuration.
- `features/<domain>/pages` owns inventory, inspection, scanning, tags, profile, authentication, label, audit, and administration workflows. Feature HTTP clients live in their domain's `data-access` folder. Inventory create/edit still shares a page rather than duplicating forms.
- `shared/components` contains reusable controls, confirmation dialogs, image viewing/uploads, and printing. `shared/util` contains reusable helpers. A shared placeholder page handles unfinished/missing pages.
- `layout/navigation` owns the shell, navigation configuration, and the extracted `user-menu`. Icons and routes have one navigation configuration; profile/logout/build-info state belongs to the user-menu component.
- `core` is reserved for cross-application auth, guards, permissions, area selection, customization, app metadata, PWA, i18n, and authentication models. Auth and area selection use RxJS subjects.
- `features/labels` renders label layouts and barcodes with bwip-js. `features/scanning` owns scanner helpers using ZXing. Shared controls that still depend on domain types are listed for a later ownership cleanup in [optimization review](OPTIMIZATION.md).

Relative imports, dynamic page imports, and documentation file links were migrated with the folder moves; public browser routes are unchanged. `/dashboard` is the start page (`features/dashboard`, also the target of `/` and the brand link); its numbers come from one `GET /api/dashboard` call counted on the server. Do not infer routes from physical folder names.

Change detection is zone-based. Both the root provider and the build's Zone.js polyfill are necessary for async workflows; see [conventions](CONVENTIONS.md). List pages load server-side pages with search and filters; see [conventions](CONVENTIONS.md).

## Backend

| Package | Responsibility |
| --- | --- |
| `controller` | HTTP routes, DTO handling, permission checks, and some inventory/admin orchestration |
| `service` | Permission evaluation, mapping, inspections, schedules, scanning, activity logs, and profile image processing |
| `repository`, `entity`, `dto`, `enums` | Persistence, domain relationships, transport contracts, and shared value sets |
| `config` | Spring Security, authentication providers, and CORS |
| `ldap`, `oidc` | Directory synchronization and authentication-provider integration |
| `files` | Validated image processing, filesystem storage, and thumbnails |
| `initializer` | Startup schema compatibility and default data |

`InventoryListController` only binds HTTP parameters and delegates to `InventoryListService`, whose read-only transaction covers authorization, filtering, sorting, paging, and DTO mapping. Other inventory and administration controllers still contain mutation logic. Extract one cohesive use case at a time, preserving transaction and authorization boundaries rather than creating generic CRUD base classes. A WebSocket dependency exists, but no WebSocket configuration or application message flow is currently implemented.

## Domain Rules to Preserve

Assets reference an optional type and location; locations form a tree. Types provide custom field definitions and inherited tags. Asset responses combine type tags with directly assigned tags. Assets, types, and locations belong to areas used by the permission matrix.

Inspection runs support inventory and individual-check modes. Expected items are selected at creation; API writes reject completed runs. This is not yet a concurrency guarantee: completion and in-flight writes need coordinated locking/version checks. Stored name snapshots keep protocols readable after related objects change, but template field definitions are still read live. See the remaining integrity work in [optimization review](OPTIMIZATION.md). Recurring due dates are calculated separately from individual inspection runs.

The current model uses `AssetType`, not a separate category entity. Permissions are area-based, not arbitrary per-object grants. See [database](DATABASE.md) and [security](SECURITY.md) before changing these boundaries.
