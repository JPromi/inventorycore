# InventoryCore

An inventory application for assets, nested locations, tags, asset types with custom fields, recurring inspections, and printable barcode/QR labels. Administration includes users, groups, area permissions, LDAP synchronization, OIDC login, and an activity log.

The Angular frontend and Spring Boot backend are separate applications. PostgreSQL stores domain data; uploaded inventory images also require persistent filesystem storage. Some navigation routes, such as the dashboard, are placeholders rather than completed features.

## Get Started

Follow [local development](docs/DEVELOPMENT.md) to configure PostgreSQL, bootstrap credentials, and the two development servers. The public configuration template is [application.example.properties](backend/src/main/resources/application.example.properties); the real local `application.properties` is ignored by Git.

## Documentation

| Topic | Read |
| --- | --- |
| Components and request flow | [Architecture](docs/ARCHITECTURE.md) |
| Setup and everyday work | [Development](docs/DEVELOPMENT.md) |
| Build commands and artifacts | [Build](docs/BUILD.md) |
| Tests and known gaps | [Testing](docs/TESTING.md) |
| HTTP contracts | [API](docs/API.md) |
| Persistence and schema updates | [Database](docs/DATABASE.md) |
| Authentication and permissions | [Security](docs/SECURITY.md) |
| Running in production | [Deployment](docs/DEPLOYMENT.md) |
| Coding, styling, and language | [Conventions](docs/CONVENTIONS.md) |
| Architectural decision process | [Decision records](docs/decisions/README.md) |

AI coding agents should start with [AGENTS.md](AGENTS.md).
