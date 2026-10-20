# Backend Instructions

Read the root [instructions](../AGENTS.md), [API guide](../docs/API.md), and [database guide](../docs/DATABASE.md).

- Use the Gradle wrapper and Java 21. Follow constructor injection and the existing controller/service/repository boundaries.
- Expose DTOs and UUIDs, not persistence entities or numeric database IDs.
- Use `PermissionService` / `AccessContext` for object access. Administrative routes also rely on `SecurityConfig`.
- Inspect owning-side associations, cascades, and transactions before deleting or reassigning entities.
- Every entity change must upgrade an existing production database in place. Add the needed idempotent step to `SchemaMigration` (schema/data) or `DataInitializer` (default data) in the same change; follow the checklist in [schema changes in production](../docs/DATABASE.md#schema-changes-in-production).
- LDAP cleanup must distinguish missing groups from failed searches. Preserve direct DN verification and existing referral regression coverage.
- Read [testing](../docs/TESTING.md) before full test runs: the context test starts against the configured database.
