# Security

## Sessions and Providers

Spring Security supports local passwords, LDAP password checks for imported users, and dynamic OIDC client registration from database settings. Local passwords use BCrypt. Successful authentication establishes a server-side HTTP session; the example session inactivity timeout is 24 hours. There is no JWT token lifecycle or shared session-store configuration in the repository.

`sourceProvider` identifies account ownership. Local accounts cannot be taken over through OIDC. Cross-provider login for nonlocal accounts is a separate OIDC setting. LDAP synchronization likewise does not overwrite a local or OIDC account sharing the same username.

Local users may upload/remove their profile image. LDAP and OIDC users are rejected by the upload endpoint: LDAP photos come from `thumbnailPhoto` / `jpegPhoto`; OIDC uses an HTTPS `picture` claim when supplied. Display names from LDAP fall back to usernames when missing or blank.

## Authorization

Only `GET /api/customization` and `GET /api/customization/logo` are anonymous branding endpoints. All mutations use `/api/admin/customization/**` and require `ROLE_ADMIN`. No provider credentials or internal settings are exposed through public customization. Legal/contact URLs are restricted to HTTP(S); uploaded logos are decoded/reencoded raster images, not executable SVG or HTML. Pixel dimensions are checked before full decoding, and uploads are limited to 5 MB.

The request filter requires `ROLE_ADMIN` for `/api/admin/**`. A user is an admin through its role or membership in an admin-marked group; session authorities are established at login. Other domain operations use `PermissionService` and `AccessContext` to evaluate current group permissions. Do not assume every existing admin session is immediately revoked when group membership changes.

Permissions support view, create, edit, inspect, delete, and admin actions for `ASSET`, `LOCATION`, or `ASSET_TYPE`. A null resource type or area broadens the grant to all types or areas. An object may be accessible through any of its areas. View access to a location extends to descendant locations and their assets; this does not automatically grant mutation rights.

Frontend guards and permission-based action visibility improve UX, but backend checks remain authoritative. File and profile-image delivery currently require authentication rather than a per-file inventory ownership check; do not describe them as object-permission protected.

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
