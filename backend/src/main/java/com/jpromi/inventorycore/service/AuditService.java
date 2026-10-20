package com.jpromi.inventorycore.service;

import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.dto.AssetFieldValueResponse;
import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.dto.AuditLogResponse;
import com.jpromi.inventorycore.dto.GroupPermissionResponse;
import com.jpromi.inventorycore.entity.AuditLog;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.AuditLogRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.TagRepository;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Activity log: who did what with which object and when.
 *
 * <p>Entries are language neutral: actions and object kinds are enum names, details are
 * {@link AuditDetail}s with field keys, raw values and event codes, stored as JSON. Clients turn
 * them into text in their language.
 *
 * <p>Changes are found by comparing the API response of an object before and after the change
 * ({@link #logChanges}), so new fields show up without extra work. Secrets (passwords, client
 * secrets) are never written. Logging never breaks the actual request: errors only go to the
 * server log.
 */
@Service
public class AuditService {

    private static final Logger LOG = LoggerFactory.getLogger(AuditService.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<AuditDetail>> DETAILS = new TypeReference<>() {};
    private static final int MAX_VALUE_LENGTH = 500;

    /** Not worth a log line, or secret. */
    private static final Set<String> IGNORED = Set.of(
        "uuid", "createdAt", "deletedAt", "deleted", "childLocationUuids", "assetUuids", "inspectionIntervalDays",
        "inspectionCount", "usable", "editable", "deletable", "assetTypeNames", "areaNames", "assetCount", "locationCount",
        "assetTypeCount", "bindPassword", "bindPasswordSet", "clientSecret", "clientSecretSet", "password", "redirectUri",
        "lastSyncAt", "lastSyncResult", "sourceProvider", "statusChangedAt"
    );

    private final AuditLogRepository repository;
    private final AppUserRepository userRepository;
    private final AssetRepository assetRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LocationRepository locationRepository;
    private final AreaRepository areaRepository;
    private final TagRepository tagRepository;
    private final GroupRepository groupRepository;

    public AuditService(
        AuditLogRepository repository,
        AppUserRepository userRepository,
        AssetRepository assetRepository,
        AssetTypeRepository assetTypeRepository,
        LocationRepository locationRepository,
        AreaRepository areaRepository,
        TagRepository tagRepository,
        GroupRepository groupRepository
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.assetRepository = assetRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.locationRepository = locationRepository;
        this.areaRepository = areaRepository;
        this.tagRepository = tagRepository;
        this.groupRepository = groupRepository;
    }

    /** Writes one entry for the logged-in user. Runs in its own transaction, also within read-only requests. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(AuditAction action, AuditObjectType type, UUID objectUuid, String objectName, List<AuditDetail> details) {
        try {
            Optional<User> user = currentUser();
            repository.save(AuditLog.builder()
                .action(action)
                .objectType(type)
                .objectUuid(objectUuid)
                .objectName(truncate(objectName, 500))
                .userUuid(user.map(User::getUuid).orElse(null))
                // null = no logged-in user (system); clients show their own word for it
                .userName(user.map(AuditService::displayName).orElse(null))
                .details(details == null || details.isEmpty() ? null : JSON.writeValueAsString(details))
                .build());
        } catch (RuntimeException exception) {
            LOG.warn("Could not write activity log for {} {} {}", action, type, objectUuid, exception);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(AuditAction action, AuditObjectType type, UUID objectUuid, String objectName, AuditDetail... details) {
        log(action, type, objectUuid, objectName, List.of(details));
    }

    /**
     * Logs an update with the fields that differ between the two API responses (records). Nothing
     * is written when nothing changed.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logChanges(AuditObjectType type, UUID objectUuid, String objectName, Object before, Object after) {
        List<AuditDetail> changes;
        try {
            changes = diff(before, after);
        } catch (RuntimeException exception) {
            LOG.warn("Could not compare {} {}", type, objectUuid, exception);
            changes = List.of(AuditDetail.modified(null));
        }
        if (!changes.isEmpty()) {
            log(AuditAction.UPDATE, type, objectUuid, objectName, changes);
        }
    }

    public static AuditLogResponse toResponse(AuditLog log) {
        return new AuditLogResponse(
            log.getUuid(),
            log.getCreatedAt(),
            log.getUserUuid(),
            log.getUserName(),
            log.getAction(),
            log.getObjectType(),
            log.getObjectUuid(),
            log.getObjectName(),
            readDetails(log.getDetails())
        );
    }

    private static List<AuditDetail> readDetails(String details) {
        if (details == null || details.isBlank()) {
            return List.of();
        }
        try {
            return JSON.readValue(details, DETAILS);
        } catch (RuntimeException exception) {
            // entries from before the details were structured: keep the text as it is
            return List.of(AuditDetail.event("TEXT", "text", details));
        }
    }

    /** A group permission as language-neutral object (rights by name). */
    public AuditDetail.Permission permission(GroupPermissionResponse permission) {
        List<String> rights = new ArrayList<>();
        if (permission.admin()) {
            rights.add("ADMIN");
        }
        if (permission.canView()) {
            rights.add("VIEW");
        }
        if (permission.canCreate()) {
            rights.add("CREATE");
        }
        if (permission.canEdit()) {
            rights.add("EDIT");
        }
        if (permission.canDelete()) {
            rights.add("DELETE");
        }
        if (permission.canInspect()) {
            rights.add("INSPECT");
        }
        return new AuditDetail.Permission(
            permission.resourceType() == null ? null : permission.resourceType().name(),
            permission.areaUuid() == null ? null : nameOf(permission.areaUuid()),
            rights
        );
    }

    // ---- comparing ----

    /** One detail for every changed component of two records of the same type. */
    public List<AuditDetail> diff(Object before, Object after) {
        if (before == null || after == null || !before.getClass().isRecord() || before.getClass() != after.getClass()) {
            return Objects.equals(before, after) ? List.of() : List.of(AuditDetail.modified(null));
        }
        List<AuditDetail> details = new ArrayList<>();
        for (RecordComponent component : before.getClass().getRecordComponents()) {
            String field = component.getName();
            if (IGNORED.contains(field)) {
                continue;
            }
            Object oldValue = read(component, before);
            Object newValue = read(component, after);
            if (sameValue(oldValue, newValue)) {
                continue;
            }
            if ("fieldValues".equals(field)) {
                details.addAll(fieldValueChanges(oldValue, newValue));
            } else if (field.endsWith("Json")) {
                // layouts and option lists: too long to show, the change itself is what matters
                details.add(AuditDetail.modified(field));
            } else if ("images".equals(field)) {
                details.add(AuditDetail.change(field, String.valueOf(size(oldValue)), String.valueOf(size(newValue))));
            } else if (oldValue instanceof Collection<?> || newValue instanceof Collection<?>) {
                details.add(listChange(field, oldValue, newValue));
            } else {
                details.add(AuditDetail.change(field, value(oldValue), value(newValue)));
            }
        }
        return details;
    }

    /** Custom fields: one detail per field, by its name. */
    private List<AuditDetail> fieldValueChanges(Object oldValue, Object newValue) {
        Map<String, String> before = fieldValues(oldValue);
        Map<String, String> after = fieldValues(newValue);
        Set<String> names = new LinkedHashSet<>(before.keySet());
        names.addAll(after.keySet());
        List<AuditDetail> details = new ArrayList<>();
        for (String name : names) {
            String a = blankToNull(before.get(name));
            String b = blankToNull(after.get(name));
            if (!Objects.equals(a, b)) {
                details.add(AuditDetail.customField(name, truncate(a, MAX_VALUE_LENGTH), truncate(b, MAX_VALUE_LENGTH)));
            }
        }
        return details;
    }

    private static Map<String, String> fieldValues(Object value) {
        Map<String, String> result = new LinkedHashMap<>();
        if (value instanceof Collection<?> collection) {
            for (Object entry : collection) {
                if (entry instanceof AssetFieldValueResponse field) {
                    result.put(field.name() == null ? field.fieldKey() : field.name(), field.value());
                }
            }
        }
        return result;
    }

    /** Added and removed entries; only "modified" when just the content of entries changed. */
    private AuditDetail listChange(String field, Object oldValue, Object newValue) {
        List<Object> before = entries(oldValue);
        List<Object> after = entries(newValue);
        List<Object> added = after.stream().filter(entry -> !before.contains(entry)).toList();
        List<Object> removed = before.stream().filter(entry -> !after.contains(entry)).toList();
        if (added.isEmpty() && removed.isEmpty()) {
            return AuditDetail.modified(field);
        }
        return AuditDetail.listChange(field, added, removed);
    }

    private List<Object> entries(Object value) {
        if (!(value instanceof Collection<?> collection)) {
            return value == null ? List.of() : List.of(entry(value));
        }
        return collection.stream().map(this::entry).distinct().sorted(Comparator.comparing(String::valueOf)).toList();
    }

    /** List entry: permissions as objects, everything else by its name. */
    private Object entry(Object value) {
        if (value instanceof GroupPermissionResponse permission) {
            return permission(permission);
        }
        return value(value);
    }

    /** Raw value: references by name, records by their name, enums by name, booleans as true / false. */
    private String value(Object value) {
        if (value == null || (value instanceof String text && text.isBlank())) {
            return null;
        }
        if (value instanceof UUID uuid) {
            return nameOf(uuid);
        }
        if (value instanceof Enum<?> constant) {
            return constant.name();
        }
        if (value.getClass().isRecord()) {
            for (RecordComponent component : value.getClass().getRecordComponents()) {
                if ("name".equals(component.getName())) {
                    return String.valueOf(read(component, value));
                }
            }
        }
        return truncate(String.valueOf(value), MAX_VALUE_LENGTH);
    }

    /** Name of the object behind a reference (location, type, area, tag, group, asset); the id if it is gone. */
    private String nameOf(UUID uuid) {
        return locationRepository.findByUuid(uuid).map(location -> location.getName())
            .or(() -> assetTypeRepository.findByUuid(uuid).map(type -> type.getName()))
            .or(() -> areaRepository.findByUuid(uuid).map(area -> area.getName()))
            .or(() -> tagRepository.findByUuid(uuid).map(tag -> tag.getName()))
            .or(() -> groupRepository.findByUuid(uuid).map(group -> group.getName()))
            .or(() -> assetRepository.findByUuid(uuid).map(asset -> asset.getName()))
            .orElse(uuid.toString());
    }

    private static boolean sameValue(Object a, Object b) {
        if ((a == null || a instanceof String) && (b == null || b instanceof String)) {
            return Objects.equals(blankToNull((String) a), blankToNull((String) b));
        }
        if (a instanceof Collection<?> left && b instanceof Collection<?> right) {
            // order does not matter for sets of tags, areas, ...
            return left.size() == right.size() && left.containsAll(right) && right.containsAll(left);
        }
        if (a instanceof Collection<?> left && b == null) {
            return left.isEmpty();
        }
        if (b instanceof Collection<?> right && a == null) {
            return right.isEmpty();
        }
        return Objects.equals(a, b);
    }

    private static int size(Object value) {
        return value instanceof Collection<?> collection ? collection.size() : 0;
    }

    private static Object read(RecordComponent component, Object record) {
        try {
            return component.getAccessor().invoke(record);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }

    // ---- helpers ----

    private Optional<User> currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication.getName() == null) {
            return Optional.empty();
        }
        return userRepository.findByUsername(authentication.getName());
    }

    private static String displayName(User user) {
        String display = user.getDisplayName();
        return display == null || display.isBlank() ? user.getUsername() : display + " (" + user.getUsername() + ")";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String truncate(String value, int length) {
        return value == null || value.length() <= length ? value : value.substring(0, length - 1) + "…";
    }
}
