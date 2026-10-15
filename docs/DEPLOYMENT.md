# Deployment

## What Is Provided

The repository builds an Angular static application and an executable Spring Boot JAR. It does not include Dockerfiles, Compose, Kubernetes manifests, CI/CD workflows, a production reverse-proxy configuration, or an established hosting target. The following are integration requirements, not an already shipped deployment stack.

## Runtime Layout

Serve `frontend/dist/inventorycore/browser/` through a static host with SPA fallback for client routes. Forward `/api`, `/oauth2`, and `/login/oauth2` to the backend without rewriting them into the SPA index. Keep these paths on the application's origin unless the security and client configurations are intentionally updated.

Run the JAR produced by `bootJar` with Java 21 and an explicitly supplied runtime configuration. For example, with the actual built filename substituted:

```sh
java -jar backend/build/libs/<boot-jar>.jar --spring.config.location=file:/path/to/application.properties
```

Do not select an auxiliary plain JAR if the build also produces one. The frontend is not automatically included in this JAR.

## Required Configuration and State

Use [application.example.properties](../backend/src/main/resources/application.example.properties) as the property inventory, not as a production-ready configuration.

| Configuration | Purpose |
| --- | --- |
| `spring.datasource.url`, `.username`, `.password` | PostgreSQL connection |
| `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_PASSWORD` | Bootstrap identity placeholders supported by the example |
| `app.files.path` / `FILES_PATH` | Persistent inventory file storage, default `data/files` relative to the process |
| `app.files.image-max-size`, `.thumbnail-size` | Inventory image processing limits |
| `spring.servlet.multipart.max-file-size`, `.max-request-size` | Upload request limits |
| `server.port`, `server.servlet.session.timeout` | HTTP listener and inactivity timeout |

Back up PostgreSQL and the upload directory together. Ensure the backend can write the upload directory. LDAP/OIDC provider configuration is stored in PostgreSQL and must be protected along with credentials.

## Production Considerations

Angular's service worker is enabled only outside development mode. Serve over HTTPS, review update/cache behavior, and keep API/authentication routes out of SPA navigation fallback. Inventory files are cached by the configured service worker; offline content retention needs a deployment-specific review.

Startup can modify the schema and create default data. Review [database behavior](DATABASE.md) and [security settings](SECURITY.md) before pointing the application at production data. The example enables SQL output and automatic schema updates; do not treat either as an approved production policy.

The LDAP scheduler has process-local timing and no distributed lock. Sessions also have no configured shared store. Multi-instance deployment, session affinity, synchronized jobs, secret delivery, monitoring, and restore procedures remain unresolved infrastructure decisions.
