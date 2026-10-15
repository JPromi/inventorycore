# 0001 Single Container Image with a Separate PostgreSQL Container

Status: accepted, 2026-10-15

## Context

The frontend and backend were built and hosted separately, and the repository had no container or CI setup. The application should be built by GitHub Actions as one deployable application and run on a server with Docker Compose, pulling the image from GitHub.

## Decision

- The [Dockerfile](../../Dockerfile) builds the Angular app and bundles it into the Spring Boot JAR (`-PfrontendDist`). The backend serves it (`SpaWebConfig`), so app, API, and OIDC share one origin and no separate web server is needed.
- PostgreSQL is not part of the image. [deploy/docker-compose.yml](../../deploy/docker-compose.yml) runs the official `postgres:17-alpine` image next to the app, with a health check and its own volume; uploads live in a second volume.
- [.github/workflows/docker.yml](../../.github/workflows/docker.yml) pushes to GHCR: version tags `v*` produce the version tags and `latest`; manual runs choose `beta` (default) or `latest`.

Alternatives considered: PostgreSQL inside the app image (one process per container, separate updates and backups of database and app would be lost) and a separate nginx container for the frontend (another image and a proxy configuration for the same result).

## Consequences

Paths outside `/api` are public in Spring Security (static files and client routes); backend endpoints must stay under `/api`. Updating the image runs the schema update on start, so back up both volumes before updating. Only one app instance is supported (see [deployment](../DEPLOYMENT.md)).
