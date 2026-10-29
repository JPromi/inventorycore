# Deployment

## Inspection notifications

Configure SMTP in Administration → E-Mail-Versand (`/admin/notifications`), including the sender address,
port, optional authentication and TLS. External e-mail is disabled by default. Users can select it
only after the administrator enables a complete configuration. SMTP needs outbound connectivity
to the configured server; certificate and hostname checks remain enabled. Port 465 uses implicit
TLS, while the STARTTLS option enforces an upgrade on ordinary SMTP ports. The sending domain and
SMTP account must permit the configured sender address.

Push uses the existing production Angular service worker and requires HTTPS (localhost is the
browser's development exception), browser notification permission and activation on each device.
On iOS/iPadOS, use the home-screen installation in a browser/OS version supporting Web Push.
The backend generates and stores VAPID keys on first startup; no external push account or manually
configured key is needed. Allow outbound HTTPS to the registered Google, Mozilla, Apple or Windows
push service. Push payloads contain a generic reminder and open `/notifications`; inventory details
are fetched only after authentication. Browser support and delivery remain subject to OS policies.

Generation starts after one minute and repeats hourly. Delivery batches run every minute with at
most five attempts, and expired push subscriptions (HTTP 404/410) are removed. Delivery failures are
logged using the notification UUID and exception class without SMTP secrets or provider responses.
After rollout, verify a real SMTP delivery and a real installed-device push; mocked regression
tests do not prove those external services or device permissions work in the deployment.

## What Is Provided

The application ships as one container image: the Angular app is built and bundled into the Spring Boot JAR, which serves it next to the API. PostgreSQL runs as a separate container. Kubernetes manifests, a production reverse-proxy configuration, and backup automation are not included.

| File | Purpose |
| --- | --- |
| [Dockerfile](../Dockerfile) | Multi-stage build: frontend (`npm run build`), backend (`bootJar` with `-PfrontendDist`), Java 21 JRE runtime as a non-root user |
| [docker/application.properties](../docker/application.properties) | Configuration baked into the image (`/app/config/application.properties`); every value comes from environment variables |
| [deploy/](../deploy/) | Standalone `docker-compose.yml` and `.env.example` that pull the published image; copy this folder to the server |
| [.github/workflows/docker.yml](../.github/workflows/docker.yml) | Builds and pushes the image to `ghcr.io/<owner>/inventorycore` |

## Image Tags and Versions

| Trigger | Image tags | App version |
| --- | --- | --- |
| Push of a tag `v1.2.3` | `1.2.3`, `1.2`, `latest` | `1.2.3` |
| Manual run (Actions > Docker image > Run workflow), channel `beta` (default) | `beta`, `sha-<commit>` | `beta-<commit>` |
| Manual run, channel `latest` | `latest`, `sha-<commit>` | `latest-<commit>` |

The version becomes the Gradle project version (`-PappVersion`) and the image label `org.opencontainers.image.version`. Images are built for `linux/amd64` and `linux/arm64`. A new GHCR package is private; either make it public in the package settings or run `docker login ghcr.io` with a token that has `read:packages` on the server.

## Running with Docker Compose

On the server, using only the `deploy/` folder:

```sh
cp .env.example .env    # change DB_PASSWORD and DEFAULT_ADMIN_PASSWORD, choose INVENTORYCORE_TAG
docker compose up -d
docker compose pull && docker compose up -d   # update to the current image of the tag
```

The `app` service waits for the `db` health check. The database is reachable only inside the Compose network; the app publishes port 8080 (`APP_PORT`). The volume `db-data` holds PostgreSQL, `files` holds uploaded images (`/app/data`). Back up both together.

Build an image locally from the repository root with `docker build --build-arg APP_VERSION=dev -t inventorycore .`.

## Configuration

Environment variables of the image (see `docker/application.properties`):

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection (defaults `db`, `5432`, `inventorycore`, `inventorycore`, password `inventorycore`) |
| `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_PASSWORD` | Local admin created on the first start if missing, default `inv` / `core`; change the password after the first login. Changing the variables later does not reset an existing account |
| `FILES_PATH` | Upload storage, default `/app/data/files` |
| `SESSION_TIMEOUT` | Session inactivity timeout, default `24h` |
| `NOMINATIM_URL`, `NOMINATIM_EMAIL` | Address search server and contact address |
| `JAVA_TOOL_OPTIONS` | JVM options, default `-XX:MaxRAMPercentage=75` |

Any other Spring property can be set as an environment variable (for example `SPRING_DATASOURCE_URL`), or mount a complete file over `/app/config/application.properties`. LDAP/OIDC provider configuration is stored in PostgreSQL and must be protected along with credentials.

## Running the JAR Without Docker

Build the bundled JAR (see [build](BUILD.md)) and run it with Java 21 and an explicit configuration:

```sh
java -jar backend/build/libs/inventorycore-<version>.jar --spring.config.location=file:/path/to/application.properties
```

Do not select the auxiliary `-plain.jar`. Without `-PfrontendDist` the JAR contains only the API; then serve `frontend/dist/inventorycore/browser/` through a static host with SPA fallback and forward `/api`, `/oauth2`, and `/login/oauth2` to the backend on the same origin.

## Serving the Frontend

`SpaWebConfig` serves the bundled files from `classpath:/static/` with `Cache-Control: no-cache` (browsers revalidate; Angular's hashed files and the service worker handle versions). Paths without a file extension outside `/api`, `/oauth2`, and `/login/oauth2` return `index.html` for the Angular router; missing files and unknown API paths keep their 404/401. Security permits everything outside `/api/**`; all API rules stay as described in [security](SECURITY.md).

## Production Considerations

Serve over HTTPS through a reverse proxy that sets `X-Forwarded-Proto` and `X-Forwarded-Host`; the image uses `server.forward-headers-strategy=framework`, so redirects and the default OIDC redirect URI use the public address. Set the OIDC public URL in the admin UI when the proxy does not forward these headers. Angular's service worker is active in production builds; review update/cache behavior and offline content retention for your deployment.

Startup can modify the schema and create default data. Review [database behavior](DATABASE.md) and [security settings](SECURITY.md) before pointing the application at production data. The image disables SQL logging and keeps automatic schema updates (`ddl-auto=update`). Updates run the required migration steps on start, in place, without manual work (see [schema changes in production](DATABASE.md#schema-changes-in-production)); there is no migration history or automatic rollback, so back up the database and upload volumes before updating to a new image.

The LDAP scheduler has process-local timing and no distributed lock. Sessions have no shared store. Run a single app container; multi-instance deployment, session affinity, synchronized jobs, secret delivery, monitoring, and restore procedures remain unresolved.
