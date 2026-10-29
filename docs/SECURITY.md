# Security

## Sessions and Providers

Spring Security supports local passwords, LDAP password checks for imported users, and dynamic OIDC client registration from database settings. Local passwords use BCrypt. Successful authentication establishes a server-side HTTP session; the example session inactivity timeout is 24 hours. There is no JWT token lifecycle or shared session-store configuration in the repository.

Sign-ins, failed sign-ins and sign-outs (password, LDAP and OIDC) are written to the activity log as `LOGIN`, `LOGIN_FAILED` and `LOGOUT` entries about the user, with the way of signing in, a language-neutral failure reason, the client IP address (`getRemoteAddr()`, i.e. after the forwarded headers of a trusted reverse proxy are applied) and the user agent (at most 500 characters). Failed attempts on an existing user name belong to that account; attempts on unknown names appear only in the activity log. The login answer stays the same for every failure reason. Admins see a user's entries on the user page (`/api/admin/users/{uuid}/logins`). These entries are personal data and are kept like the rest of the activity log; there is no automatic retention limit yet.

`sourceProvider` identifies account ownership. Local accounts cannot be taken over through OIDC. Cross-provider login for nonlocal accounts is a separate OIDC setting. The optional OIDC auto-redirect (like Nextcloud) sends the login page straight to the identity provider; `/login?direct=1` still shows the login form (e.g. for local admins), and the redirect is also skipped after a failed SSO login (`?error=`, to avoid a loop) and right after a logout (the provider session would sign the user in again). It is only a convenience of the login page: `/api/auth/providers` reports it as `oidcAutoRedirect` only when OIDC is enabled and complete, and local login stays available on the server. LDAP synchronization likewise does not overwrite a local or OIDC account sharing the same username.

Local users may upload/remove their profile image. LDAP and OIDC users are rejected by the upload endpoint: LDAP photos come from `thumbnailPhoto` / `jpegPhoto`; OIDC uses an HTTPS `picture` claim when supplied. Display names from LDAP fall back to usernames when missing or blank.

## Authorization

Only `GET /api/customization` and `GET /api/customization/logo` are anonymous branding endpoints. All mutations use `/api/admin/customization/**` and require `ROLE_ADMIN`. No provider credentials or internal settings are exposed through public customization. Legal/contact URLs are restricted to HTTP(S); uploaded logos are decoded/reencoded raster images, not executable SVG or HTML. Pixel dimensions are checked before full decoding, and uploads are limited to 5 MB.

The request filter requires `ROLE_ADMIN` for `/api/admin/**` and authentication for every other `/api/**` path except the public login, health, and customization reads. Paths outside `/api` are public because they are the bundled Angular app (static files and client routes); never add a backend endpoint outside `/api`. A user is an admin through its role or membership in an admin-marked group; session authorities are established at login. Other domain operations use `PermissionService` and `AccessContext` to evaluate current group permissions. Do not assume every existing admin session is immediately revoked when group membership changes.

Permissions support view, create, edit, inspect, delete, and admin actions for `ASSET`, `LOCATION`, `ASSET_TYPE`, or `TASK`. A null resource type or area broadens the grant to all types or areas. The built-in group "Alle Benutzer" (`Group.everyone`, created on start without permissions) applies to every user without membership: `PermissionService.permissionsOf` adds its permissions to those of the user's own groups, for access checks and the login answers alike. It cannot be renamed, deleted, given members, or made an admin group; on the permissions page an empty group choice means this group. An object may be accessible through any of its areas. View access to a location extends to descendant locations and their assets; this does not automatically grant mutation rights. A location marked as shared (`shared`, "Gemeinsamer Standort") does not pass its visibility on: sub-locations and assets in it are visible only through their own areas, so areas using one store room see only their own things there. Location responses list only the sub-locations and assets the reader may see. Changing the flag on an existing location needs EDIT in every area of the location, since it decides what the other areas see.

Frontend guards and permission-based action visibility improve UX, but backend checks remain authoritative: every endpoint must refuse what the UI hides. When adding an endpoint, check the action against the object's areas on the server before reading or changing anything, and keep the frontend's `PermissionService` mirror in line. The configuration menu and its pages (statuses, tags, types, labels, inspection templates; `configGuard`) appear only for users who may create or edit asset types in at least one area (`PermissionService.canConfigure`), the right the backend requires for maintaining all of them; the read-only type detail page stays reachable from assets.

## Permission Rules

"Any area" means the action is allowed in at least one of the object's areas (`AccessContext.can`); "every area" means in each of them (`canInAll`); "all areas" means a permission without area (`canEverywhere`). Admins pass every check. Objects the user may not see answer 404, missing rights 403.

| Object / operation | Rule |
| --- | --- |
| Assets, locations, asset types: view, lists, `/page` lists | VIEW in any area; locations and assets also through a visible (parent) location that is not shared. Lists and searches are filtered after this check, so totals never count hidden objects. |
| Create | CREATE in **every** chosen area; referenced parent, location, type must be visible. |
| Edit | EDIT in any current area, plus EDIT in every area that is added or removed. |
| Delete | DELETE in any area. Soft-deleted objects answer 404 for reads and changes. |
| Images of assets, locations, types | Only freshly uploaded files or files already attached to the same object; files of other objects are refused (403). External image links must be `http(s)` or app-relative. |
| Tags (global) | Create: CREATE/EDIT for assets or types anywhere. **Rename/recolor: EDIT for types in all areas. Delete: DELETE for types in all areas**; refused (409) while the tag is the only tag limiting a recurring inspection. |
| Inspection templates | View: INSPECT or type VIEW in its areas. Create: CREATE/EDIT for types in **every** chosen area (no areas = all areas). Edit: EDIT in any area plus every added/removed area. Delete: DELETE in its areas. |
| Protocols: view, scan, check, photos | INSPECT in the protocol's area. Scanning, adding, checking, photographing or removing an item additionally needs INSPECT in the **asset's** areas (otherwise the scan is ignored or 403). The detail leaves out items of assets the reader may not view. |
| Protocols: delete | Open: the user who started it, or ASSET DELETE in the protocol's area. Completed: admins only. |
| Tasks | Per area of the task (`TASK`): VIEW, EDIT or INSPECT shows its tasks and runs; CREATE creates in that area, EDIT changes (moving to another area also needs EDIT or CREATE there), DELETE deletes the task and its open runs. Users and groups (including "Alle Benutzer") a task is assigned to see it and carry out its runs without any TASK right. Besides assignees, INSPECT or EDIT in the area allows carrying out runs (results, comments, completion). Completed runs refuse changes (409); deleting them is for admins, open ones need DELETE. Individually chosen assets must be visible to the editor; filter-selected assets are those of the task's area. Assignees see the names of the affected assets in the run, the asset link only with VIEW on the asset. The assignee choice (`/tasks/assignees`) lists all enabled users and all groups to whoever may create or edit tasks somewhere. |
| Due dates | Read per asset: only for users who inspect, only inspection kinds they may use. Fixed date: INSPECT on the asset and use of the inspection kind; within one year back / ten years ahead. |
| Files (`/files/{uuid}`, `/info`) | Readable for the uploader, admins, or whoever may see an object the file belongs to (asset, location, type, or the protocol and asset of an inspection photo); otherwise 404. Upload needs CREATE/EDIT for assets, locations or types, or INSPECT, somewhere. |
| Object histories (`/assets/{uuid}/logs`) | VIEW on the asset; without INSPECT on it, inspection results, protocol photos and inspection scans are left out. |
| Inventory id | Must not equal another asset's inventory id, serial number or inventory number (409), since all three are scan codes. |
| Geocoding | Location CREATE or EDIT somewhere. |
| `/admin/**` | Admin session. The LDAP test reuses the stored bind password only for the stored server URL and bind DN. |

The login changes the session id (session fixation). Profile-image delivery requires authentication only.

Known remaining gaps, not yet enforced: a protocol's `filterSummary` and the activity log diff names (`nameOf`) can name locations, types or areas the reader may not see; changing `inspectionPolicy` (e.g. to `EXCLUDED`) needs only EDIT; deleting a location does not check for child locations or assets.

## External Map Services

The backend calls Nominatim (default `https://nominatim.openstreetmap.org`, `app.geocoding.*`) only for the location form's address/coordinate lookups, which require location create or edit rights. Requests carry the configured User-Agent/e-mail, are throttled to one per second per instance, and repeated lookups are cached in memory. Location addresses typed by users are therefore sent to that service. Maps are drawn in the app with Leaflet; the browser loads map tiles directly from `https://tile.openstreetmap.org` (the OSM tile usage policy applies, and viewers' IP addresses reach that server). A Content Security Policy added in front of the app must allow that host in `img-src`.

## LDAP Synchronization

The persisted interval defaults to six hours and accepts minutes, hours, or days. A scheduled poll checks whether sync is due. The configured group filter determines synchronized groups; missing LDAP groups are deleted with memberships and permissions. Local and OIDC groups remain intact.

Continuation references can occur during subtree searches. The client tolerates the recognized continuation-reference response and verifies apparently missing groups directly by their stored DN before applying the sync. Real search/verification failures abort changes. Preserve this distinction when editing cleanup logic.

## Configuration and Production Review

- Local `application.properties` is ignored. Use placeholders in documentation and the example configuration.
- Bind passwords and OIDC client secrets are retained in database settings. API responses omit their values and use presence flags; changing UI fields must not expose them. No application-level database-secret encryption is implemented.
- Empty submitted provider passwords preserve existing secrets. Audit diffs exclude password/secret values.
- CSRF is explicitly disabled in `SecurityConfig`; CORS permits a fixed set of local origins. These are current behaviors, not a claim of production hardening. Review CSRF, cookie policy, HTTPS, and allowed origins for the deployment topology.
- LDAP certificate validation can be disabled through settings. Do not enable this as a default production workaround.
- Replace bootstrap credentials and restrict database/upload storage access before deployment. Consider that PWA file caching can retain previously fetched file content on a device.

See [deployment](DEPLOYMENT.md) for the infrastructure boundary and [testing](TESTING.md) for database-backed test behavior.
