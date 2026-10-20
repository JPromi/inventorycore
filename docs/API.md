# API

`GET /api/app-info` is public and returns `name`, `version`, and `githubUrl`. The version comes from Gradle-generated Spring Boot build information (`-PappVersion` for releases); direct IDE runs without build information report `development`. The navigation footer loads this endpoint independently of branding settings.

Inspection templates accept and return `defaultTagUuids` and `includeChildAssets` (default false). Starting an inspection locks the template tags; users may add selections but cannot remove template defaults. Preview and creation always merge template defaults into supplied filters, including empty lists. They accept a nullable `includeChildAssets` override; null uses the template default. With child inclusion enabled, all descendants of matching roots are added regardless of tag, location, type, area, or due-date filters, but each child still requires view/inspect permission and must not be excluded from inspections. Assets are deduplicated; the resulting run items and filter summary preserve the selection independently of later template edits.

## Contract

Locations have a fixed `locationType` (`SITE`, `BUILDING`, `FLOOR`, `ROOM`, `WAREHOUSE`, `SHELF`, `CABINET`, `RACK`, `CONTAINER`, `VEHICLE`, `OUTDOOR`, `OTHER`); a missing value is stored and returned as `OTHER`. Locations carry optional address parts `street`, `postalCode`, `city`, `country` and WGS 84 `latitude` / `longitude` (both or neither, latitude -90..90, longitude -180..180, otherwise 400). `address` in responses is formatted from the parts ("Straße 1, 1010 Ort, Land"); requests only use `address` when all parts are empty (older clients), so older free-text addresses stay readable. `GET /api/geocoding/search?q=` and `GET /api/geocoding/reverse?lat=&lon=` proxy Nominatim and return `GeocodingResult` (`address`, `label`, the address parts, `latitude`, `longitude`); search returns up to five matches, reverse returns 404 when nothing is found and 502 when Nominatim fails. Both require location create or edit rights in some area.

Global customization: public `GET /api/customization` returns branding and login texts/links; `GET /api/customization/logo` serves the reencoded logo. Admin-only `GET/PUT /api/admin/customization` use `CustomizationDto` (`brandName`, `brandColor`, `loginTitle`, `loginMessage`, `imprintUrl`, `privacyUrl`, `websiteUrl`, `supportUrl`, read-only `logoUrl`). Blank values restore defaults/hide links. Colors are six-digit HEX; links must be absolute HTTP(S) without embedded credentials. `POST /api/admin/customization/logo` accepts multipart `file` (5 MB, 25 megapixels, readable raster images); `DELETE` removes it. Uploads are reencoded with maximum edge 1200 pixels, preserving transparency, and receive versioned URLs. Admin changes are audited.

The admin SPA route is `/admin/customization`. Public settings are applied on app load and immediately after saving. Label JSON supports `type: "logo"` and `useBrandColor` for text/frames. Logo elements and branding placeholders resolve from current global settings at preview/print time rather than storing duplicated image data in every template. Supported branding placeholders are `{brandName}`, `{brandColor}`, `{website}`, `{imprint}`, `{privacy}`, `{support}`, `{loginTitle}`, and `{loginMessage}`. Printing waits for logo images to decode in the print frame.

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
| `/assets/page`, `/locations/page`, `/asset-types/page`, `/tags/page` | Searched, paged inventory lists; `InventoryListController` delegates to `InventoryListService` |
| `/inspection-types/page`, `/inspections/page`, `/label-templates/page`, `/admin/users/page`, `/admin/groups/page`, `/admin/areas/page` | Searched, paged lists of the other list pages; their controllers |

### Paged lists

All `/page` endpoints take `page` (from 0), `size` (default 50, max 200) and `q` (every word must occur), and return `PageResponse` (`items`, `total`, `page`, `size`, `hasMore`). `areas` (repeatable) is the sidebar area selection. Further filters: assets `tag`, `location` (with sub-locations), `assetType`, `area`; locations `type`, `area`; asset types `area`; protocols `status` (`OPEN`/`COMPLETED`, response adds `openCount` / `completedCount` within the area selection, independent of search and status); users `group`, `status` (`enabled`, `disabled`, `admin`). Tags return `TagUsageResponse` with `assetCount` / `assetTypeCount` of visible objects; groups return `GroupRowResponse` with `memberCount` and up to five `members`. Sorting is fixed per list (by name; protocols newest first; label templates by area, default area first).

OIDC browser redirects additionally use `/oauth2/authorization/oidc` and `/login/oauth2/**` outside `/api`.

## Authentication and Access

The frontend sends credentials with HTTP requests and restores the user through `/auth/me`. The login response includes authentication state, user UUID, username, display name, role, provider, profile image URL, and group permissions. This is session authentication, not bearer-token/JWT authentication.

`/admin/**` requires an admin session. Other operations apply resource/area permissions or feature-specific checks; see [security](SECURITY.md). Tags do not have a separate resource permission type. UUIDs are identifiers, not access grants.

## Lists, Files, and Errors

Inventory `/page` endpoints accept zero-based `page`, `size`, server search, and resource-specific filters and return `{ items, total, page, size, hasMore }`. Permission and area filters run before totals and slicing; the frontend uses these pages for incremental loading. Plain inventory list endpoints remain authorized arrays for pickers. The current service loads candidate entities and filters/pages in memory, not with database pagination; moving this work to SQL must preserve permission-aware totals and inherited areas/tags. The admin audit endpoint returns `{ items, total, page, size }`; its size is capped at 200.

Image upload uses `multipart/form-data` with a `file` part. File content supports `?variant=thumb`. Profile uploads use a distinct endpoint and return a user DTO. Do not serialize raw inventory image bytes into inventory JSON responses.

Handlers use `ResponseStatusException` and explicit statuses such as 201, 204, 400, 401, 403, and 404. There is no uniform project-wide error envelope; file upload has a local handler exposing a `message`. Preserve the actual response shape rather than assuming every error includes readable text.

No generated OpenAPI specification or API collection is currently checked in. Controllers and DTOs remain the authoritative route and payload definitions.

Asset form requests/responses include nullable `parentAssetUuid` and `parentAssetNote` (up to 1000 characters). A null parent detaches the asset and clears its link note. The existing asset create/update routes handle these fields; no separate relationship endpoint is required. Parent deletion returns 409 while live children exist. Related asset names and child lists in the UI come from the authorized asset list, so hierarchy links do not grant additional visibility.

Assets also expose `inspectionPolicy`: `STANDARD` (default, label-based), `MANUAL` (no label; confirm manually), or `EXCLUDED` (omit from new inspections and due dates). Inspection items snapshot this policy and the parent UUID/link note at creation; later asset edits do not rewrite existing runs. Scanning a manual or excluded asset returns `IGNORED`, and an excluded asset cannot be explicitly added to a run.

A scanned code can match several assets, because inventory id, inventory number and serial number are all scan codes and serial or inventory numbers need not be unique. `GET /api/scan` returns every visible match. `POST /api/inspections/{uuid}/scan` then records nothing and returns `AMBIGUOUS` with `candidates` (`InspectionScanCandidate`: `uuid`, `name`, `invId`, `assetTypeName`, `locationName`, `matchedBy` = `INV_ID` / `INVENTORY_NUMBER` / `SERIAL_NUMBER`, `inInspection`), sorted by name. The client repeats the scan with the same `code` and the chosen `assetUuid`; a uuid that is not among the code's matches returns `IGNORED`, so the choice cannot reach other assets.
