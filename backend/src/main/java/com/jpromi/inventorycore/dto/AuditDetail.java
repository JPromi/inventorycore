package com.jpromi.inventorycore.dto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One language-neutral line of an activity log entry; clients turn it into text.
 *
 * <ul>
 *   <li>Field change: {@code field} (key of the API field, e.g. {@code locationUuid}, or the name of
 *       a custom field with {@code custom = true}) with raw values {@code from} / {@code to}
 *       (references resolved to names, booleans as {@code true}/{@code false}, enums by name), or
 *       {@code added} / {@code removed} for lists, or {@code modified = true} when only the content
 *       of something long (layouts) changed.</li>
 *   <li>Event: {@code code} (e.g. {@code SCAN_PAGE}) with {@code params}.</li>
 * </ul>
 * List entries and values are strings, or {@link Permission} objects for group permissions.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuditDetail(
    String field,
    Boolean custom,
    Object from,
    Object to,
    List<Object> added,
    List<Object> removed,
    Boolean modified,
    String code,
    Map<String, Object> params
) {

    /** A group permission: object kind ({@code null} = all), area name ({@code null} = all areas) and rights. */
    public record Permission(String resourceType, String area, List<String> rights) {}

    public static AuditDetail change(String field, Object from, Object to) {
        return new AuditDetail(field, null, from, to, null, null, null, null, null);
    }

    public static AuditDetail customField(String name, Object from, Object to) {
        return new AuditDetail(name, true, from, to, null, null, null, null, null);
    }

    public static AuditDetail listChange(String field, List<Object> added, List<Object> removed) {
        return new AuditDetail(field, null, null, null, added.isEmpty() ? null : added, removed.isEmpty() ? null : removed, null, null, null);
    }

    /** Changed, but the values are not shown (field null: "something changed"). */
    public static AuditDetail modified(String field) {
        return new AuditDetail(field, null, null, null, null, null, true, null, null);
    }

    /** Event with parameters given as key, value, key, value, ... ({@code null} values are left out). */
    public static AuditDetail event(String code, Object... keyValues) {
        Map<String, Object> params = new LinkedHashMap<>();
        for (int index = 0; index + 1 < keyValues.length; index += 2) {
            if (keyValues[index + 1] != null) {
                params.put(String.valueOf(keyValues[index]), keyValues[index + 1]);
            }
        }
        return new AuditDetail(null, null, null, null, null, null, null, code, params.isEmpty() ? null : params);
    }
}
