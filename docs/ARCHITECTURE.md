# Architecture

## System Boundaries

The browser runs a standalone Angular SPA. Angular services call the Spring MVC REST API over HTTP using a session cookie. Spring Data JPA repositories persist to PostgreSQL. Image bytes for inventory uploads live on disk, with metadata in the database.

Local development uses Angular's proxy for `/api`, `/oauth2`, and `/login/oauth2`. In the container image the backend serves the built Angular app itself (`SpaWebConfig`), so browser, API, and OIDC paths share one origin; see [deployment](DEPLOYMENT.md).

## Frontend

- `app.routes.ts` defines guarded routes, lazy-loaded feature pages, and reusable inventory page/form configuration.
- `core/pages` contains inventory, inspection, scan, profile, and administration workflows. Create/edit inventory forms share a page rather than a dialog.
- `core/components` contains shared controls, confirmation dialogs, uploads, and activity displays. `core/routes` contains the navigation shell.
- `core/service` owns HTTP access and application state. Auth and area selection use RxJS subjects; permissions determine UI visibility.
- `core/labels` renders label layouts and barcodes using bwip-js. Camera scanning uses ZXing. PWA support handles installation, connectivity, and updates.

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

This is not a strict service-only business layer: inventory and administration controllers contain mutation logic. Extend the local pattern unless the task justifies a focused extraction. A WebSocket dependency exists, but no WebSocket configuration or application message flow is currently implemented.

## Domain Rules to Preserve

Assets reference an optional type and location; locations form a tree. Types provide custom field definitions and inherited tags. Asset responses combine type tags with directly assigned tags. Assets, types, and locations belong to areas used by the permission matrix.

Inspection runs support inventory and individual-check modes. Expected items are selected at creation; completed runs become immutable. Stored name snapshots keep protocols readable after related objects change. Recurring due dates are calculated separately from individual inspection runs.

The current model uses `AssetType`, not a separate category entity. Permissions are area-based, not arbitrary per-object grants. See [database](DATABASE.md) and [security](SECURITY.md) before changing these boundaries.
