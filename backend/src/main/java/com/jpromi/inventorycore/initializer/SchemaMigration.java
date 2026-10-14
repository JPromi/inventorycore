package com.jpromi.inventorycore.initializer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Cleans up schema leftovers that {@code ddl-auto=update} cannot handle on its own.
 * Every step is idempotent, so it is safe to run on every start.
 */
@Component
@Order(0)
public class SchemaMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SchemaMigration.class);

    private final JdbcTemplate jdbc;

    public SchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        // images may reference an uploaded file instead of an external url
        for (String table : new String[] { "asset_images", "location_images", "asset_type_images" }) {
            if (columnExists(table, "url")) {
                jdbc.execute("alter table " + table + " alter column url drop not null");
            }
        }

        // enum check constraints created by Hibernate do not know newly added values
        jdbc.execute("alter table if exists inspection_items drop constraint if exists inspection_items_status_check");
        jdbc.execute("alter table if exists audit_logs drop constraint if exists audit_logs_action_check");
        jdbc.execute("alter table if exists audit_logs drop constraint if exists audit_logs_object_type_check");

        // activity log details became a JSON list (Hibernate does not change the type of existing columns)
        if (columnExists("audit_logs", "details")) {
            jdbc.execute("alter table audit_logs alter column details type text");
        }

        if (!tableExists("group_permissions")) {
            return;
        }

        // the enum check constraint created by Hibernate still lists old values (e.g. CATEGORY)
        jdbc.execute("alter table group_permissions drop constraint if exists group_permissions_resource_type_check");
        int renamed = jdbc.update("update group_permissions set resource_type = 'ASSET_TYPE' where resource_type = 'CATEGORY'");
        if (renamed > 0) {
            log.info("Renamed {} CATEGORY permissions to ASSET_TYPE", renamed);
        }

        // a permission without resource type applies to all kinds of objects
        jdbc.execute("alter table group_permissions alter column resource_type drop not null");

        // permissions on single objects were replaced by permissions per area
        if (columnExists("group_permissions", "resource_uuid")) {
            int removed = jdbc.update("delete from group_permissions where resource_uuid is not null");
            jdbc.execute("alter table group_permissions drop column resource_uuid");
            log.info("Removed {} object specific permissions (replaced by area permissions)", removed);
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = ?", Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
            "select count(*) from information_schema.columns where table_name = ? and column_name = ?", Integer.class, table, column);
        return count != null && count > 0;
    }
}
