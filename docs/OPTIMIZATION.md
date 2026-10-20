# Optimization Review

Reviewed on 2026-10-20. This is a source-based engineering review, not a production performance measurement or a database data audit. Implemented changes and remaining proposals are deliberately separated. No stored data was deleted or deduplicated.

## Implemented

- Reorganized frontend code into `features`, `layout`, `shared`, and cross-application `core`. Feature pages and their HTTP clients now live together; browser routes and API URLs were preserved. Existing generic inventory list/form configurations remain shared rather than creating separate copies for assets, locations, and types.
- Extracted [UserMenu](../frontend/src/app/layout/navigation/user-menu/user-menu.ts) from the shell and moved navigation labels, icons, and destinations into [navigation.config.ts](../frontend/src/app/layout/navigation/navigation.config.ts). Long-lived subscriptions use destruction-aware teardown. AuthStateService remains the source of user identity; components do not maintain independent authenticated-user stores.
- Reformatted component SCSS as multiline blocks and nested ordinary component styles under `:host`. PrintDocument and Leaflet keep global wrappers; the large inspection page avoids adding a repeated host prefix to every selector because that exceeded its unchanged build budget. These are intentional exceptions, not reasons to raise the budget.
- Removed duplicate detail configuration interfaces: [InventoryDetailPage](../frontend/src/app/features/inventory/pages/inventory-detail-page/inventory-detail-page.ts) imports the existing types from `detail-configs.ts`. Image sorting now happens once per loaded object instead of on every change-detection read. Superseded detail requests are cancelled and per-object schedule/image state is reset.
- Fixed `/dashboard` links reaching the not-found wildcard: the route now explicitly redirects to the working inventory view. A dedicated dashboard has not been implemented.
- Fixed [group retry](../frontend/src/app/features/admin/pages/group-form-page/group-form-page.ts) after a partial membership failure: retain the newly created group UUID immediately and reconcile each successful membership update. Retry updates the existing group and only the outstanding memberships. This is not a substitute for a future transactional group-membership API.
- Made [inspection creation](../frontend/src/app/features/inspections/pages/inspection-new-page/inspection-new-page.ts) initialization and preview/area streams destruction-aware, so delayed initialization cannot attach a new sidebar subscription after navigation away.
- Extracted [InventoryListService](../backend/src/main/java/com/jpromi/inventorycore/service/InventoryListService.java) from the HTTP controller. One read-only transaction covers authorized filtering, sorting, paging, and mapping. Empty and out-of-range tag pages now skip asset/type scans for usage counts while retaining correct totals and normalized page metadata.
- Corrected API documentation that incorrectly described inventory list pagination as client-side. Rebased documentation file links with the folder moves.

## Folder Ownership

```text
src/app/
  core/                 auth, guards, i18n, permissions, area/theme/PWA/app state
  layout/navigation/    shell, navigation config, user menu
  shared/components/    dropdowns, selection, upload/viewer, print, common controls
  shared/pages/         generic placeholder
  shared/util/          paging, tree/location helpers currently shared by consumers
  features/
    admin/pages/        users, groups, areas, providers, permissions, customization
    admin/data-access/
    audit/pages/        object activity
    audit/data-access/
    auth/pages/         login
    inspections/pages/  templates, creation, run/protocol
    inspections/data-access/
    inventory/pages/    shared asset/location/type lists, forms, details
    inventory/data-access/
    labels/             rendering, models, printing, template service, pages
    profile/pages/
    scanning/           scanner helpers, scan page and data access
    tags/pages/
```

Avoid a second catch-all inside `shared`. Domain widgets such as AssetInspectionList, AuditTimeline, LocationMap and LocationLookup currently remain there to keep this migration bounded; move them into their owning feature's `components` folder when changing those widgets. Likewise, location/inspection-specific helpers can move from `shared/util` to the relevant feature. Generic upload controls should eventually depend on a shared media contract rather than the inventory API interface. Do not add compatibility barrels or copied files at old paths.

## Integrity Priorities

These findings are not fixed by the folder/service refactor. Reproduce them with focused tests before changing persistence or completion contracts.

1. **P1: Coordinate inspection autosave and completion.** [InspectionPage](../frontend/src/app/features/inspections/pages/inspection-page/inspection-page.ts), `setValue`, `flushSaves`, and `complete`: debounced entries leave the queue when the request starts, and save errors are converted to successful null results. Completion can therefore miss an active request or proceed after a failed field save. Extract a page-scoped save coordinator that tracks queued and active writes, serializes each field's updates, retains failed work, and blocks completion until all writes succeed. Include notes, status/condition changes, and uploads in the completion policy, not only text timers.
2. **P1: Enforce completed-run consistency across concurrent transactions.** [InspectionService](../backend/src/main/java/com/jpromi/inventorycore/service/InspectionService.java), `requireOpen` and `complete`: checking OPEN before writing is not a lock. There is no entity version or shared repository lock coordinating completion with in-flight mutations. Choose optimistic versioning or a consistent parent-run lock, cover every mutation path, and test with two transactions. A frontend disabled button alone is insufficient.
3. **P2: Snapshot the full inspection field schema.** `InspectionService.toDetail` reads current template field definitions, whereas saved values already preserve field labels/types. Editing a template can change the presentation of an existing protocol. Snapshot fields/options at creation, migrate existing runs deliberately, and retain immutable historical values. Asset-name/type/location/hierarchy snapshots are intentional history and must not be removed as duplicates.
4. **P2: Define mutation/audit transaction semantics.** [InventoryController](../backend/src/main/java/com/jpromi/inventorycore/controller/InventoryController.java) location/type writes contain authorization, relationship replacement, persistence, mapping, and auditing without a single service transaction. Extract cohesive transactional mutation services. [AuditService](../backend/src/main/java/com/jpromi/inventorycore/service/AuditService.java) uses `REQUIRES_NEW`; decide explicitly whether an audit entry may survive a rolled-back outer operation.
5. **P2: Review aggregate visibility and relationship links.** Inspection summary counts include all run items while detail access removes hidden assets. Confirm whether aggregate disclosure and filter names are intended. [ApiMapper](../backend/src/main/java/com/jpromi/inventorycore/service/ApiMapper.java) relationship UUID lists should consistently exclude soft-deleted associations, and authorization must remain enforced on linked object endpoints. Do not assume a visible UUID grants access.

## Performance Priorities

Costs below follow from query/collection structure. No SQL counts, latency improvements, or production-size benchmarks have been measured.

| Priority | Evidence | Next Change and Guardrail |
| --- | --- | --- |
| P2 | InventoryListService loads all active candidates, then filters and pages in Java. Tags count usage by scanning active assets/types. | Move permission-aware filters, search and counts into repository queries/projections; first record SQL count, latency and memory for representative large datasets. Apply authorization before LIMIT/OFFSET and totals; preserve inherited areas/tags and descendant locations. |
| P2 | InspectionService lists/maps all runs before controller pagination; template response mapping performs a usage count per visible template. | Add aggregate/projection queries and batch template counts; map only the selected authorized page. Avoid broad collection fetch joins with paging. |
| P2 | InspectionService rebuilds location indexes across detail/scanning responses and separately for descendant selections. | Build one operation-local hierarchy index and pass it through selection/mapping. Do not introduce an application-wide cache without invalidation for moves, deletes and permission changes. |
| P2 | InventoryDetailPage loads full asset/location/type collections for relationships and repeatedly searches them. | Introduce indexed view state and relationship-specific endpoints; keep full authorized picker endpoints where they are actually required. |
| P3 | Cross-feature pages repeat authorization-aware loading and form reconciliation. | Extract pure tag/field reconciliation and scoped request coordinators after concrete duplication is demonstrated; avoid a generic page superclass or generic CRUD service. |

## Duplication Rules

- A Java DTO and its TypeScript interface intentionally represent the same transport contract. Keep them consistent; they are not duplicate persisted data. A generated contract may help later, but no OpenAPI generation is currently configured.
- Inherited type tags/fields are resolved from the type; directly owned asset values remain separate. Do not copy inheritance into direct assignments. Response-side merging is a view, not a second source of truth.
- Protocol identity/value snapshots are deliberate historical data. In contrast, recreating unchanged asset-type field definitions on every update changes their UUIDs unnecessarily; reconcile definitions by stable identity before adding relationships to them.
- Stored-file metadata should be authoritative for uploaded images. Inventory image filename/content type currently repeat stored-file values and accept client data; use stored-file metadata when a file UUID is provided, preserving explicit handling for external URLs.
- Do not maintain duplicate selected-tag arrays or derived options indefinitely when a local view model can derive them from one owned/locked selection. Retain the distinction between locked inheritance and editable asset additions.
- No SQL repair, uniqueness migration, or deletion of existing duplicates was performed. A real data cleanup requires a backup, duplicate report, explicit canonical keys, and relationship-preserving migration.

## UI Simplification

The existing compact visual design and workflows were preserved during the structural migration. The following are specific next design changes, not silently implemented redesigns:

1. **Detail pages:** keep identity, location and key facts before media on mobile. The current sidebar-first layout puts schedules and galleries above facts. Show a compact next-due summary and move history/older schedules behind an expandable section.
2. **Detail actions:** keep Edit primary; group data-sheet/label printing into a secondary print menu and deletion into a clearly labelled overflow action with confirmation. Do not hide frequently used inspection actions.
3. **Inventory/type forms:** retain General, Custom Fields, Inspection and Images as visible sections. Expand advanced custom-field/interval settings only when configured; keep inherited values visibly locked. A section should be a band/divider, not a card nested in another card.
4. **Inspection runs:** show asset identity, status and immediate next action first. Keep notes, field values, photos and scan diagnostics in the existing expandable item editor; show progress once rather than repeating the same totals in several panels. Extract protocol presentation and camera interaction from the run orchestration before adding more controls.
5. **Permissions:** prefer an area/group filter and named presets before displaying the complete matrix. Keep destructive/admin permission states explicit; progressive disclosure must not silently change permissions.
6. **Long lists:** keep server search, active filter chips, view mode and selection as the predictable toolbar. Batch actions appear only during selection; do not add a second row of per-item actions to every tile.

Validate each UI change with real long names, nested assets/locations, many fields/images, permission-limited users, desktop and narrow touch screens. Compare screenshots and the number of steps for common work; physical Safari testing remains separate from Edge touch emulation.

## Verification

- Production frontend build and i18n key check must pass; style-budget warnings remain visible and budgets were not increased.
- Run the complete Playwright suite after folder/style changes, including print pagination, Leaflet, dropdown top-layer positioning, image viewing, touch selection, and permission-limited lists.
- `refactoring-regressions.spec.ts` covers dashboard compatibility, stale linked-detail responses and partial group-membership retries.
- `InventoryListServiceTest` and `PagingTest` cover filtering before totals/slicing, inherited tags/areas, usage counts, and empty/out-of-range pages without unnecessary usage queries. These mock tests do not measure SQL performance or run database concurrency tests.
- The existing Angular login unit spec remains a separate documented baseline failure. No full backend context test was run against the configured PostgreSQL database.
