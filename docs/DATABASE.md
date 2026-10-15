# Database

## Persistence Model

PostgreSQL is accessed through Spring Data JPA / Hibernate. Domain entities generally have a generated numeric primary key for joins and a separate unique UUID for API use. LDAP/OIDC settings are singleton records with a fixed ID rather than ordinary UUID-addressed resources.

| Domain | Relationships and storage |
| --- | --- |
| Assets | Optional type and location, direct tags, areas, field values, and image records; `invId` is a separate string generated when omitted |
| Asset types | Custom field definitions, tags, areas, image records, and related assets |
| Locations | Optional parent, child locations, assets, areas, and images |
| Users and groups | Many-to-many membership; group permissions apply to a resource type and optional area |
| Inspections | Types/field definitions, runs/items, item values/photos, and per-asset schedule data |
| Labels | One owning area and a layout stored as JSON text with millimeter dimensions |
| Activity logs | Object/user snapshots and language-neutral event/diff details stored as JSON text |
| Stored files | Metadata and relative disk paths; inventory file content is outside PostgreSQL |

Type tags are merged into asset responses at read time. Asset-specific field values and type field definitions are distinct. Avoid copying inherited tags into the direct asset association just to make the frontend display them.

Assets can also reference one parent asset through `parent_asset_id`. The optional `parentAssetNote` belongs to this relationship (for example, a component's RAM slot), not the asset description. Hierarchy assignment rejects self-links/cycles and requires visibility of a newly selected parent. Type, location, areas, and permissions remain independent; children are not cascade-deleted. A live parent cannot be deleted until its active children are detached or moved.

`inspectionPolicy` defaults to `STANDARD` for new and existing assets. `MANUAL` assets remain individually expected without scan confirmation; `EXCLUDED` assets are omitted from new runs and recurring due dates. Inspection items snapshot the policy, parent UUID, and link note. Existing protocols keep their original snapshots; older items without hierarchy metadata remain flat. Hierarchy display groups only items within the run and does not widen its filters or permissions.

## Deletion and Transactions

Assets, locations, and asset types use `deleted` / `deletedAt` soft deletion in inventory handlers. Groups and tags are physically deleted after detaching associations. Group permissions cascade with their group. Do not assume all entities share one deletion policy.

User membership is the owning side of the user/group relation. Removing an inverse collection alone does not remove all join-table references. Keep relationship updates and deletion in a transaction, following the existing handlers.

Transactions are declared on service operations and selected controller methods. Some response mapping traverses lazy relationships. Review the read/mapping context before moving code outside a transaction or changing persistence-session behavior.

Profile images differ from inventory uploads: local/LDAP profile image bytes, MIME type, and version are stored on the user; OIDC stores a provider image URL. Backups must therefore include both PostgreSQL and inventory upload storage.

## Current Schema Evolution

The example configuration uses `spring.jpa.hibernate.ddl-auto=update`. There is no Flyway or Liquibase migration history.

[SchemaMigration](../backend/src/main/java/com/jpromi/inventorycore/initializer/SchemaMigration.java) runs before default-data initialization. It applies idempotent PostgreSQL compatibility operations that Hibernate does not handle, including obsolete constraints/columns, older permission types, and activity-log storage changes. Some steps delete or transform legacy data; this is not a substitute for a backup or a reviewed migration plan.

[DataInitializer](../backend/src/main/java/com/jpromi/inventorycore/initializer/DataInitializer.java) creates a default area, assigns area-less objects, creates an initial label template, and ensures the configured admin username exists.

The LDAP interval value retains its historical `sync_interval_hours` column name for compatibility; `syncIntervalUnit` now determines whether the value means minutes, hours, or days. Older separate group selections are exposed as an editable group filter and cleared when settings are saved.

## Operational Gaps

No PostgreSQL server version, test database lifecycle, migration rollback process, or backup/restore automation is pinned in the repository. Agree these before production schema work; do not document an unimplemented migration system as current behavior.
