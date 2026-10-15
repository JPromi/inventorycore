# Development

## Requirements

- Java 21 with `JAVA_HOME` configured; use the checked-in Gradle wrapper.
- Node.js compatible with Angular 21. The installed CLI declares `^20.19.0 || ^22.12.0 || >=24.0.0`. The frontend declares npm 12.0.2; use a Node version compatible with that npm release as well.
- PostgreSQL reachable from the backend. For development no database container is supplied; the production Compose setup in [deploy/](../deploy/) uses PostgreSQL 17.
- Microsoft Edge for the current Playwright configuration.

## Configure the Backend

Copy [application.example.properties](../backend/src/main/resources/application.example.properties) to `backend/src/main/resources/application.properties` only if the local file does not already exist. Configure the database URL, username, and password for your own development database. The local file is Git-ignored; do not overwrite another developer's configuration.

Set `DEFAULT_ADMIN_USERNAME` and `DEFAULT_ADMIN_PASSWORD` before the first start. The example falls back to `admin` / `admin`, which is only suitable for isolated development. Startup creates the configured local admin if its username is absent; changing these settings does not reset an existing password.

Startup also updates the schema and creates default area/label data. Use a database intended for this checkout, not an unrelated shared database.

From `backend/` on Windows:

```powershell
.\gradlew.bat bootRun
```

On Unix use `./gradlew bootRun`. The example listens on port 8080; `/api/health` is public.

## Start the Frontend

From `frontend/`:

```sh
npm ci
npm start
```

Use `npm.cmd` on Windows if needed. Open `http://localhost:4200`. The proxy in [proxy.conf.json](../frontend/proxy.conf.json) forwards backend and OIDC paths to port 8080. The environment API URL is `/api`; a dev-server port change does not require a different backend URL.

If a port is occupied, choose another, for example `npm start -- --port 4201`. Restart the dev server after changes to `angular.json`, especially polyfills; hot reload alone does not apply all build configuration changes.

LDAP and OIDC settings are edited through the admin UI and persisted in the database, not configured solely through environment variables. LDAP synchronization can import/deactivate users and delete missing LDAP groups, including groups excluded by the current filter. Use a suitable development directory for integration checks.

## Workflow

Read the relevant [conventions](CONVENTIONS.md), change Java and TypeScript contracts together, and run the [checks appropriate to the change](TESTING.md). API mocks can validate browser behavior without modifying directory data. Production PWA behavior differs from the development server; see [deployment](DEPLOYMENT.md).
