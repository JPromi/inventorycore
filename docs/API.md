# API

Inspection templates accept and return `defaultTagUuids` and `includeChildAssets` (default false). Starting an inspection locks the template tags; users may add selections but cannot remove template defaults. Preview and creation always merge template defaults into supplied filters, including empty lists. They accept a nullable `includeChildAssets` override; null uses the template default. With child inclusion enabled, all descendants of matching roots are added regardless of tag, location, type, area, or due-date filters, but each child still requires view/inspect permission and must not be excluded from inspections. Assets are deduplicated; the resulting run items and filter summary preserve the selection independently of later template edits.

## Contract

Inspection templates expose nullable `protocolAreaUuid`. A configured area is mandatory for runs created from that template and overrides the run request's `areaUuid`. Without it, the current sidebar/default-area behavior is retained. Template assignment requires ASSET_TYPE create/edit permission in the target area; starting a run additionally requires ASSET/INSPECT there. Existing runs retain their own area when a template changes. Deleting an area moves both template protocol-area assignments and runs to the default area.

New inspection requests accept `areaUuid` for the protocol's own area, independently of template applicability and asset filters. If omitted, the backend uses the configured default area. Assignment requires ASSET/INSPECT in that area. Summary `areaUuids`/`areaNames` describe the protocol area; listing, detail access, and mutations enforce its inspection permission. The new-inspection form preselects a permitted sidebar-selected area, otherwise the default or first permitted area. Deleting an area moves its protocols to the default area.

Template defaults also include `defaultAssetTypeUuids` and `defaultLocationUuids`. These are locked starting selections, independent of the existing applicability types/areas. Additional selections remain removable. `InspectionFilter.locationUuids` supports multiple locations (OR), including their descendants when `includeSubLocations` is true; the legacy singular `locationUuid` remains supported and is combined with the list. Runs snapshot the location list. `recurringTagUuids` separately limits recurring due dates to assets matching at least one direct or inherited tag, in addition to applicability types/areas. An empty recurring-tag list imposes no tag restriction. Standard tags do not restrict recurring scheduling.

Spring MVC controllers expose JSON under `/api`. Requests and responses are defined in the backend `dto` package; TypeScript service interfaces mirror them. Public object references use UUID strings. Enum values use their Java enum names, such as `ASSET_TYPE` and `HOURS`.

Most inventory/admin updates use `PATCH` with a form DTO, not JSON Patch operations. Some handlers assign all request fields, so do not assume omitted values are always preserved. Provider settings and some inspection endpoints use `PUT`. Inspect the relevant controller and DTO before changing clients.

## Route Families

Paths below are relative to `/api`. This is a map to the implementation, not a duplicate endpoint specification.

| Routes | Responsibility / source controller |
| --- | --- |
| `/auth`, `/auth/me`, `/auth/providers`, `/auth/logout` | Session login, restoration, provider discovery, logout; `AuthController` |
| `/auth/me/profile-image`, `/profile-images/{uuid}` | Local profile image upload/removal and authenticated image delivery; `ProfileImageController` |
| `/assets`, `/locations`, `/asset-types`, `/tags` | Inventory read/write operations; `InventoryController` |
| `/areas` | Areas accessible to the current user; `AreaController` |
| `/admin/users`, `/admin/groups`, `/admin/areas` | Administrative CRUD; `AdminController` |
| `/admin/groups/{groupUuid}/permissions`, `/admin/permissions/{uuid}` | Group permission mutations; `AdminController` |
| `/admin/ldap`, `/admin/ldap/test`, `/admin/ldap/sync` | Directory configuration, connection test, sync; `AuthProviderController` |
| `/admin/oidc`, `/admin/oidc/test` | OIDC configuration/discovery test; `AuthProviderController` |
| `/inspection-types`, `/inspections`, `/inspection-schedules` | Types, runs, items, scans, photos, completion and due dates; `InspectionController` |
| `/label-templates` | Printable label configuration; `LabelTemplateController` |
| `/scan` | Resolve a scanned value; `ScanController` |
| `/files`, `/files/{uuid}`, `/files/{uuid}/info` | Multipart image upload, content, metadata; `FileController` |
| `/audit-logs`, `/assets/{uuid}/logs`, `/locations/{uuid}/logs` | Admin activity search and authorized object histories; `AuditController` |
| `/health` | Public health response; `HealthController` |

OIDC browser redirects additionally use `/oauth2/authorization/oidc` and `/login/oauth2/**` outside `/api`.

## Authentication and Access

The frontend sends credentials with HTTP requests and restores the user through `/auth/me`. The login response includes authentication state, username, display name, role, provider, profile image URL, and group permissions. This is session authentication, not bearer-token/JWT authentication.

`/admin/**` requires an admin session. Other operations apply resource/area permissions or feature-specific checks; see [security](SECURITY.md). Tags do not have a separate resource permission type. UUIDs are identifiers, not access grants.

## Lists, Files, and Errors

Inventory endpoints currently return authorized arrays; the frontend implements their pagination. The admin audit endpoint instead accepts zero-based `page` and `size` and returns `{ items, total, page, size }`; size is capped at 200. Do not add pagination query parameters to inventory clients without implementing a matching backend contract.

Image upload uses `multipart/form-data` with a `file` part. File content supports `?variant=thumb`. Profile uploads use a distinct endpoint and return a user DTO. Do not serialize raw inventory image bytes into inventory JSON responses.

Handlers use `ResponseStatusException` and explicit statuses such as 201, 204, 400, 401, 403, and 404. There is no uniform project-wide error envelope; file upload has a local handler exposing a `message`. Preserve the actual response shape rather than assuming every error includes readable text.

No generated OpenAPI specification or API collection is currently checked in. Controllers and DTOs remain the authoritative route and payload definitions.

Asset form requests/responses include nullable `parentAssetUuid` and `parentAssetNote` (up to 1000 characters). A null parent detaches the asset and clears its link note. The existing asset create/update routes handle these fields; no separate relationship endpoint is required. Parent deletion returns 409 while live children exist. Related asset names and child lists in the UI come from the authorized asset list, so hierarchy links do not grant additional visibility.

Assets also expose `inspectionPolicy`: `STANDARD` (default, label-based), `MANUAL` (no label; confirm manually), or `EXCLUDED` (omit from new inspections and due dates). Inspection items snapshot this policy and the parent UUID/link note at creation; later asset edits do not rewrite existing runs. Scanning a manual or excluded asset returns `IGNORED`, and an excluded asset cannot be explicitly added to a run.
