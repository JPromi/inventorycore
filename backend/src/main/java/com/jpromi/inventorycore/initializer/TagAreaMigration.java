package com.jpromi.inventorycore.initializer;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Splits formerly global tags without discarding assignments or widening stored filters. */
@Component
@Order(2)
public class TagAreaMigration implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(TagAreaMigration.class);
    private final JdbcTemplate jdbc;

    public TagAreaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public void run(String... args) {
        List<Long> legacy = jdbc.queryForList("select id from tags where area_id is null order by id", Long.class);
        for (Long id : legacy) {
            migrate(id);
        }
        // Null is only needed between Hibernate adding the column and this upgrade step.
        jdbc.execute("alter table tags alter column area_id set not null");
        jdbc.execute("create unique index if not exists idx_tag_area_name on tags (area_id, name)");
        if (!legacy.isEmpty()) {
            log.info("Assigned {} legacy tags to areas, retaining their assignments and filters", legacy.size());
        }
    }

    private void migrate(Long id) {
        String name = jdbc.queryForObject("select name from tags where id = ?", String.class, id);
        String color = jdbc.queryForObject("select color from tags where id = ?", String.class, id);
        UUID original = jdbc.queryForObject("select uuid from tags where id = ?", UUID.class, id);
        Set<Long> areas = new LinkedHashSet<>(jdbc.queryForList("""
            select aa.area_id from asset_tags t join asset_areas aa on aa.asset_id = t.asset_id where t.tag_id = ?
            union select aa.area_id from asset_type_tags t join asset_type_areas aa on aa.asset_type_id = t.asset_type_id where t.tag_id = ?
            union select ia.area_id from inspection_type_default_tags t
                join inspection_type_areas ia on ia.inspection_type_id = t.inspection_type_id where t.tag_id = ?
            union select ia.area_id from inspection_type_recurring_tags t
                join inspection_type_areas ia on ia.inspection_type_id = t.inspection_type_id where t.tag_id = ?
            union select area_id from tasks where ? = any(string_to_array(filter_tag_uuids, ','))
            order by 1
            """, Long.class, id, id, id, id, original.toString()));
        if (areas.isEmpty()) {
            areas.add(jdbc.queryForObject("select id from areas where default_area = true order by id limit 1", Long.class));
        }
        Map<Long, Long> copies = new LinkedHashMap<>();
        for (Long area : areas) {
            if (copies.isEmpty()) {
                jdbc.update("update tags set area_id = ? where id = ? and area_id is null", area, id);
                copies.put(area, id);
            } else {
                UUID uuid = UUID.randomUUID();
                Long copy = jdbc.queryForObject("insert into tags (uuid, name, color, area_id) values (?, ?, ?, ?) returning id",
                    Long.class, uuid, name, color, area);
                copies.put(area, copy);
                // Tasks store UUID filters as comma-separated values. Keep their selection in their own area.
                jdbc.update("""
                    update tasks set filter_tag_uuids = array_to_string(array_replace(string_to_array(filter_tag_uuids, ','), ?, ?), ',')
                    where area_id = ? and ? = any(string_to_array(filter_tag_uuids, ','))
                    """, original.toString(), uuid.toString(), area, original.toString());
            }
        }
        remap("asset_tags", "asset_id", "asset_areas", id, copies);
        remap("asset_type_tags", "asset_type_id", "asset_type_areas", id, copies);
        remap("inspection_type_default_tags", "inspection_type_id", "inspection_type_areas", id, copies);
        remap("inspection_type_recurring_tags", "inspection_type_id", "inspection_type_areas", id, copies);
    }

    private void remap(String table, String owner, String areaTable, Long original, Map<Long, Long> copies) {
        List<Long> owners = jdbc.queryForList("select " + owner + " from " + table + " where tag_id = ?", Long.class, original);
        for (Long object : owners) {
            List<Long> scope = jdbc.queryForList("select area_id from " + areaTable + " where " + owner + " = ?", Long.class, object);
            jdbc.update("delete from " + table + " where " + owner + " = ? and tag_id = ?", object, original);
            copies.forEach((area, tag) -> {
                if (scope.isEmpty() || scope.contains(area)) {
                    jdbc.update("insert into " + table + " (" + owner + ", tag_id) values (?, ?) on conflict do nothing", object, tag);
                }
            });
        }
    }
}
