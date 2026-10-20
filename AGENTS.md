# Agent Instructions

InventoryCore manages assets, nested locations, asset types, inspections, labels, and group permissions.
This repository contains an Angular 21 frontend in `frontend/` and a Spring Boot 4 / Java 21 backend in `backend/`, backed by PostgreSQL. They are developed separately; the container image (`Dockerfile`) bundles the frontend into the backend JAR.

## Start Here

- Read the module's `AGENTS.md` before changing it.
- Keep changes within the requested scope and preserve unrelated working-tree changes.
- Use shared SCSS variables for styling and proper German characters (ä, ö, ü, ß) in German text. See [conventions](docs/CONVENTIONS.md).
- Put every user-visible frontend text into `frontend/public/i18n/de.json` and use it through the `t` pipe / `t()`; write formal German ("Sie", "Vorhanden" instead of "Da") with general fire-service examples. See [language and texts](docs/CONVENTIONS.md#language-and-texts).
- Keep API contracts consistent between Java DTOs and TypeScript interfaces.
- InventoryCore runs in production and is updated in place, never set up again. Every data model change must upgrade an existing database without data loss; ship a migration step whenever Hibernate's automatic update is not enough. See [schema changes in production](docs/DATABASE.md#schema-changes-in-production).
- Enforce authorization in the backend; frontend guards and hidden buttons are not authorization boundaries.
- Preserve the Zone.js provider and build polyfill together. Do not migrate the app to zoneless change detection or introduce signals for ordinary page state.
- Never copy local credentials into code, documentation, or test fixtures.

## Commits

- Every agent-created commit must have a descriptive subject and a long, detailed body explaining the motivation, affected components, behavioral changes, verification performed, and any remaining limitations. Use English and describe actual results; do not claim tests that were not run.
- Every contributing AI agent must identify itself with a `Co-authored-by: Agent Name <agent-email>` trailer. Use the agent's actual identity and appropriate attribution address, for example `Co-authored-by: Codex <noreply@openai.com>`; include contributing agents rather than impersonating the human author.
- These rules apply whenever a commit is requested; they do not authorize committing or pushing without a user request. Preserve the configured Git author and review the staged changes before committing.

## Essential Commands

Run commands in the indicated directory. On Windows use `npm.cmd` if PowerShell blocks `npm` scripts; on Unix use `./gradlew` instead of `./gradlew.bat`.

| Directory | Command | Purpose |
| --- | --- | --- |
| `frontend/` | `npm ci` | Install locked npm dependencies |
| `frontend/` | `npm start` | Dev server, default port 4200 |
| `frontend/` | `npm run build` | Production frontend build |
| `frontend/` | `npm test -- --watch=false` | Angular unit tests; see known failures in testing docs |
| `frontend/` | `npm run test:e2e` | Playwright tests, configured for Edge and port 4201 |
| `frontend/` | `npm run i18n:check` | Every text key used in the sources exists in `public/i18n/de.json` |
| `backend/` | `./gradlew.bat bootRun` | Start backend, example port 8080 |
| `backend/` | `./gradlew.bat test` | Backend tests; context test needs configured PostgreSQL |
| `backend/` | `./gradlew.bat bootJar` | Executable backend JAR |

## Read Only What You Need

- [Architecture](docs/ARCHITECTURE.md): module boundaries and data flow.
- [Development](docs/DEVELOPMENT.md), [build](docs/BUILD.md), [testing](docs/TESTING.md): setup and verification.
- [API](docs/API.md), [database](docs/DATABASE.md), [security](docs/SECURITY.md): contracts and sensitive behavior.
- [Deployment](docs/DEPLOYMENT.md): runtime requirements and missing infrastructure.
- [Conventions](docs/CONVENTIONS.md): styling, language, code, and logging rules.
- [Optimization review](docs/OPTIMIZATION.md): implemented refactors, remaining risks, and UI simplification priorities.
- [Decision records](docs/decisions/README.md): when and how to record future decisions.

Update the relevant document when a change alters its documented behavior; avoid duplicating instructions across files.
