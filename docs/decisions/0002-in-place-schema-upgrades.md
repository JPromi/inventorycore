# 0002 In-Place Schema Upgrades for Production

Status: accepted, 2026-10-20

## Context

InventoryCore runs in production. Installations are updated by pulling a newer image (`docker compose pull && docker compose up -d`); the database is never set up again. Until now the schema followed the entities through `spring.jpa.hibernate.ddl-auto=update`, plus idempotent compatibility steps in [SchemaMigration](../../backend/src/main/java/com/jpromi/inventorycore/initializer/SchemaMigration.java) and default data in [DataInitializer](../../backend/src/main/java/com/jpromi/inventorycore/initializer/DataInitializer.java). Hibernate's update only adds tables, columns and some constraints; it does not rename, retype, fill, or drop anything, and it cannot add a `NOT NULL` column to a table that already has rows.

## Decision

Every change to the data model must upgrade an existing production database in place, without data loss and without manual steps. Whenever `ddl-auto=update` alone is not enough, the change ships with a migration step in `SchemaMigration` (schema and data transformations) or `DataInitializer` (required default data). The rules are in the [database guide](../DATABASE.md#schema-changes-in-production).

Not decided: whether to replace these start-up steps with a versioned migration tool (Flyway or Liquibase). That would need a baseline of the existing production schema and its own decision record.

## Consequences

- Schema work needs an upgrade path from the previous release, not only a fresh database.
- Migration steps run on every start, so each one must be idempotent and must leave already migrated data alone.
- Without a migration history there is no automatic rollback; a backup of the database and upload volumes before every update remains mandatory (see [deployment](../DEPLOYMENT.md)).
