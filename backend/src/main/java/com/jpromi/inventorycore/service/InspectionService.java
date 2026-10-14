package com.jpromi.inventorycore.service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.AssetInspectionResponse;
import com.jpromi.inventorycore.dto.InspectionCounts;
import com.jpromi.inventorycore.dto.InspectionCreateRequest;
import com.jpromi.inventorycore.dto.InspectionDetailResponse;
import com.jpromi.inventorycore.dto.InspectionFieldRequest;
import com.jpromi.inventorycore.dto.InspectionFieldResponse;
import com.jpromi.inventorycore.dto.InspectionFilter;
import com.jpromi.inventorycore.dto.InspectionItemResponse;
import com.jpromi.inventorycore.dto.InspectionItemUpdateRequest;
import com.jpromi.inventorycore.dto.InspectionItemValueResponse;
import com.jpromi.inventorycore.dto.InspectionScanResponse;
import com.jpromi.inventorycore.dto.InspectionSummaryResponse;
import com.jpromi.inventorycore.dto.InspectionTypeRequest;
import com.jpromi.inventorycore.dto.InspectionTypeResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.Inspection;
import com.jpromi.inventorycore.entity.InspectionFieldDefinition;
import com.jpromi.inventorycore.entity.InspectionItem;
import com.jpromi.inventorycore.entity.InspectionItemValue;
import com.jpromi.inventorycore.entity.InspectionType;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AssetFieldType;
import com.jpromi.inventorycore.enums.InspectionCheckMethod;
import com.jpromi.inventorycore.enums.InspectionItemStatus;
import com.jpromi.inventorycore.enums.InspectionStatus;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.InspectionItemRepository;
import com.jpromi.inventorycore.repository.InspectionRepository;
import com.jpromi.inventorycore.repository.InspectionTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.TagRepository;

/**
 * Inspection types (with their check fields) and inspection runs.
 *
 * <p>Permissions: inspection types are configuration and need the right to edit types. Starting
 * and doing inspections needs the "Prüfen" right for assets; an inspection only expects assets
 * the user may inspect. Completed inspections are read only; deleting them is for admins.
 */
@Service
public class InspectionService {

    private final InspectionTypeRepository typeRepository;
    private final InspectionRepository inspectionRepository;
    private final AssetRepository assetRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LocationRepository locationRepository;
    private final TagRepository tagRepository;
    private final AreaRepository areaRepository;
    private final ScanResolver scanResolver;
    private final InspectionItemRepository itemRepository;

    public InspectionService(
        InspectionTypeRepository typeRepository,
        InspectionRepository inspectionRepository,
        AssetRepository assetRepository,
        AssetTypeRepository assetTypeRepository,
        LocationRepository locationRepository,
        TagRepository tagRepository,
        AreaRepository areaRepository,
        ScanResolver scanResolver,
        InspectionItemRepository itemRepository
    ) {
        this.typeRepository = typeRepository;
        this.inspectionRepository = inspectionRepository;
        this.assetRepository = assetRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.locationRepository = locationRepository;
        this.tagRepository = tagRepository;
        this.areaRepository = areaRepository;
        this.scanResolver = scanResolver;
        this.itemRepository = itemRepository;
    }

    // ---- inspection types ----

    @Transactional(readOnly = true)
    public List<InspectionTypeResponse> types(AccessContext access) {
        requireTypesVisible(access);
        return typeRepository.findAll().stream()
            .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
            .map(this::toResponse)
            .toList();
    }

    @Transactional(readOnly = true)
    public InspectionTypeResponse type(AccessContext access, UUID uuid) {
        requireTypesVisible(access);
        return toResponse(typeOr404(uuid));
    }

    @Transactional
    public InspectionTypeResponse createType(AccessContext access, InspectionTypeRequest request) {
        require(access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT)
            || access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.CREATE));
        InspectionType type = InspectionType.builder().name(requireName(request.name())).build();
        applyType(type, request);
        return toResponse(typeRepository.save(type));
    }

    @Transactional
    public InspectionTypeResponse updateType(AccessContext access, UUID uuid, InspectionTypeRequest request) {
        require(access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT));
        InspectionType type = typeOr404(uuid);
        applyType(type, request);
        return toResponse(typeRepository.save(type));
    }

    @Transactional
    public void deleteType(AccessContext access, UUID uuid) {
        require(access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.DELETE));
        InspectionType type = typeOr404(uuid);
        inspectionRepository.detachType(type);
        typeRepository.delete(type);
    }

    private void applyType(InspectionType type, InspectionTypeRequest request) {
        type.setName(requireName(request.name()));
        type.setDescription(blankToNull(request.description()));
        type.setColor(blankToNull(request.color()));

        // keep existing definitions (and their uuids, which values refer to) where possible
        Map<UUID, InspectionFieldDefinition> existing = type.getFields().stream()
            .collect(Collectors.toMap(InspectionFieldDefinition::getUuid, field -> field));
        List<InspectionFieldDefinition> fields = new ArrayList<>();
        List<InspectionFieldRequest> requests = request.fields() == null ? List.of() : request.fields();
        for (int index = 0; index < requests.size(); index++) {
            InspectionFieldRequest fieldRequest = requests.get(index);
            if (fieldRequest.name() == null || fieldRequest.name().isBlank()) {
                continue;
            }
            InspectionFieldDefinition field = fieldRequest.uuid() != null ? existing.remove(fieldRequest.uuid()) : null;
            if (field == null) {
                field = InspectionFieldDefinition.builder().inspectionType(type).build();
            }
            field.setName(fieldRequest.name().trim());
            field.setFieldType(fieldRequest.fieldType() == null ? AssetFieldType.TEXT : fieldRequest.fieldType());
            field.setOptionsJson(blankToNull(fieldRequest.optionsJson()));
            field.setRequired(fieldRequest.required());
            field.setSortOrder(index);
            field.setAssetType(fieldRequest.assetTypeUuid() == null ? null : assetTypeRepository.findByUuid(fieldRequest.assetTypeUuid())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Typ " + fieldRequest.assetTypeUuid())));
            fields.add(field);
        }
        type.getFields().clear();
        type.getFields().addAll(fields);
    }

    // ---- inspections ----

    @Transactional(readOnly = true)
    public List<InspectionSummaryResponse> inspections(AccessContext access) {
        requireInspect(access);
        return inspectionRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public InspectionDetailResponse inspection(AccessContext access, UUID uuid) {
        requireInspect(access);
        return toDetail(inspectionOr404(uuid));
    }

    /** Assets the filters would select, without creating anything (for the preview when starting). */
    @Transactional(readOnly = true)
    public int preview(AccessContext access, InspectionFilter filter) {
        requireInspect(access);
        return expectedAssets(access, filter).size();
    }

    @Transactional
    public InspectionDetailResponse create(AccessContext access, User user, InspectionCreateRequest request) {
        requireInspect(access);
        InspectionType type = request.inspectionTypeUuid() == null ? null : typeOr404(request.inspectionTypeUuid());
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte eine Prüfungsart wählen.");
        }
        InspectionFilter filter = request.filter() == null
            ? new InspectionFilter(null, true, List.of(), List.of(), List.of())
            : request.filter();

        List<Asset> assets = expectedAssets(access, filter);
        Map<Long, Location> locations = locationsById();
        Inspection inspection = Inspection.builder()
            .inspectionType(type)
            .typeName(type.getName())
            .title(blankToNull(request.title()) == null ? type.getName() : request.title().trim())
            .filterLocationUuid(filter.locationUuid())
            .filterIncludeSubLocations(filter.includeSubLocations())
            .filterTagUuids(join(filter.tagUuids()))
            .filterAssetTypeUuids(join(filter.assetTypeUuids()))
            .filterAreaUuids(join(filter.areaUuids()))
            .filterSummary(describe(filter, locations))
            .createdByUuid(user.getUuid())
            .createdByName(displayName(user))
            .build();
        assets.stream()
            .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
            .forEach(asset -> inspection.getItems().add(newItem(inspection, asset, true, locations)));
        return toDetail(inspectionRepository.save(inspection));
    }

    @Transactional
    public InspectionScanResponse scan(AccessContext access, User user, UUID uuid, String code) {
        requireInspect(access);
        Inspection inspection = openInspection(uuid);
        ScanResolver.Resolution resolution = scanResolver.resolve(access, code);
        Map<Long, Location> locations = locationsById();

        if (resolution.assets().isEmpty()) {
            if (!resolution.locations().isEmpty()) {
                return new InspectionScanResponse("IGNORED", "Das ist ein Standort-Label, kein Asset.", null);
            }
            if (resolution.code().isEmpty()) {
                return new InspectionScanResponse("IGNORED", "Leerer Code.", null);
            }
            // remember unknown codes once, so they show up in the protocol
            InspectionItem item = inspection.getItems().stream()
                .filter(entry -> entry.getAsset() == null && resolution.code().equalsIgnoreCase(entry.getScannedCode()))
                .findFirst()
                .orElseGet(() -> {
                    InspectionItem unknown = InspectionItem.builder()
                        .inspection(inspection)
                        .assetName("Unbekannter Code")
                        .expected(false)
                        .scannedCode(resolution.code())
                        .build();
                    check(unknown, InspectionItemStatus.PRESENT, InspectionCheckMethod.SCAN, user);
                    inspection.getItems().add(unknown);
                    return unknown;
                });
            inspectionRepository.save(inspection);
            return new InspectionScanResponse("UNKNOWN", "Zu „" + resolution.code() + "“ gibt es kein Asset.", toResponse(item, locations));
        }

        Asset asset = resolution.assets().get(0);
        InspectionItem item = inspection.getItems().stream()
            .filter(entry -> entry.getAsset() != null && entry.getAsset().getId().equals(asset.getId()))
            .findFirst()
            .orElse(null);

        if (item != null && item.isExpected()) {
            if (item.getStatus() == InspectionItemStatus.PRESENT) {
                return new InspectionScanResponse("ALREADY_CHECKED", asset.getName() + " wurde bereits geprüft.", toResponse(item, locations));
            }
            item.setScannedCode(resolution.code());
            check(item, InspectionItemStatus.PRESENT, InspectionCheckMethod.SCAN, user);
            inspectionRepository.save(inspection);
            return new InspectionScanResponse("CHECKED", asset.getName() + " ist da.", toResponse(item, locations));
        }
        if (item != null) {
            return new InspectionScanResponse("UNEXPECTED", asset.getName() + " gehört nicht zu dieser Prüfung (bereits erfasst).", toResponse(item, locations));
        }

        InspectionItem foreign = newItem(inspection, asset, false, locations);
        foreign.setScannedCode(resolution.code());
        check(foreign, InspectionItemStatus.PRESENT, InspectionCheckMethod.SCAN, user);
        inspection.getItems().add(foreign);
        inspectionRepository.save(inspection);
        String home = foreign.getLocationName() == null ? "keinem Standort zugeordnet" : "gehört zu " + foreign.getLocationName();
        return new InspectionScanResponse("UNEXPECTED", "Fremder Gegenstand: " + asset.getName() + " (" + home + ").", toResponse(foreign, locations));
    }

    @Transactional
    public InspectionItemResponse updateItem(AccessContext access, User user, UUID uuid, UUID itemUuid, InspectionItemUpdateRequest request) {
        requireInspect(access);
        Inspection inspection = openInspection(uuid);
        InspectionItem item = itemOr404(inspection, itemUuid);

        if (request.status() != null && request.status() != item.getStatus()) {
            if (request.status() == InspectionItemStatus.PENDING) {
                item.setStatus(InspectionItemStatus.PENDING);
                item.setMethod(null);
                item.setCheckedAt(null);
                item.setCheckedByUuid(null);
                item.setCheckedByName(null);
            } else {
                check(item, request.status(), InspectionCheckMethod.MANUAL, user);
            }
        }
        if (request.note() != null) {
            item.setNote(blankToNull(request.note()));
        }
        if (request.values() != null && !request.values().isEmpty()) {
            Map<UUID, InspectionFieldDefinition> fields = applicableFields(inspection, item).stream()
                .collect(Collectors.toMap(InspectionFieldDefinition::getUuid, field -> field));
            request.values().forEach((fieldUuid, value) -> {
                InspectionFieldDefinition field = fields.get(fieldUuid);
                if (field == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Feld gehört nicht zu diesem Asset.");
                }
                setValue(item, field, value);
            });
        }
        inspectionRepository.save(inspection);
        return toResponse(item, locationsById());
    }

    /** Removes an item that was added by mistake; expected assets stay (mark them as missing instead). */
    @Transactional
    public void removeItem(AccessContext access, UUID uuid, UUID itemUuid) {
        requireInspect(access);
        Inspection inspection = openInspection(uuid);
        InspectionItem item = itemOr404(inspection, itemUuid);
        if (item.isExpected()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Erwartete Assets können nicht entfernt werden.");
        }
        inspection.getItems().remove(item);
        inspectionRepository.save(inspection);
    }

    /**
     * Completes the inspection. Assets that were not checked stay "not checked" and appear in the
     * protocol together with the missing ones. Afterwards nothing can be changed.
     */
    @Transactional
    public InspectionDetailResponse complete(AccessContext access, User user, UUID uuid, String comment) {
        requireInspect(access);
        Inspection inspection = openInspection(uuid);
        inspection.setComment(blankToNull(comment));
        inspection.setStatus(InspectionStatus.COMPLETED);
        inspection.setCompletedAt(OffsetDateTime.now());
        inspection.setCompletedByUuid(user.getUuid());
        inspection.setCompletedByName(displayName(user));
        return toDetail(inspectionRepository.save(inspection));
    }

    @Transactional
    public void delete(AccessContext access, UUID uuid) {
        Inspection inspection = inspectionOr404(uuid);
        // a completed protocol is a record; only admins may remove it
        require(inspection.isCompleted() ? access.isAdmin() : access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.INSPECT));
        inspectionRepository.delete(inspection);
    }

    /** History for the asset detail page: all inspections the asset was part of or found in. */
    @Transactional(readOnly = true)
    public List<AssetInspectionResponse> inspectionsOfAsset(AccessContext access, UUID assetUuid) {
        requireInspect(access);
        Asset asset = assetRepository.findByUuid(assetUuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset nicht gefunden"));
        require(access.canViewAsset(asset));
        return itemRepository.findByAsset(asset).stream()
            .map(item -> {
                Inspection inspection = item.getInspection();
                return new AssetInspectionResponse(
                    inspection.getUuid(),
                    inspection.getTitle(),
                    inspection.getTypeName(),
                    inspection.getStatus(),
                    inspection.getCreatedAt(),
                    inspection.getCompletedAt(),
                    item.isExpected(),
                    item.getStatus(),
                    item.getMethod(),
                    item.getCheckedAt(),
                    item.getCheckedByName(),
                    item.getLocationName(),
                    item.getNote(),
                    item.getValues().stream()
                        .map(value -> new InspectionItemValueResponse(value.getFieldUuid(), value.getFieldName(), value.getFieldType(), value.getValue()))
                        .toList()
                );
            })
            .toList();
    }

    // ---- selecting the expected assets ----

    private List<Asset> expectedAssets(AccessContext access, InspectionFilter filter) {
        Set<Long> locationIds = null;
        if (filter.locationUuid() != null) {
            Location location = locationRepository.findByUuid(filter.locationUuid())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Standort"));
            locationIds = filter.includeSubLocations() ? withDescendants(location) : Set.of(location.getId());
        }
        Set<UUID> tags = toSet(filter.tagUuids());
        Set<UUID> types = toSet(filter.assetTypeUuids());
        Set<UUID> areas = toSet(filter.areaUuids());
        Set<Long> finalLocationIds = locationIds;

        return assetRepository.findByDeletedFalse().stream()
            .filter(access::canViewAsset)
            .filter(asset -> access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, asset.getAreas()))
            .filter(asset -> finalLocationIds == null || (asset.getLocation() != null && finalLocationIds.contains(asset.getLocation().getId())))
            .filter(asset -> tags.isEmpty() || asset.getTags().stream().anyMatch(tag -> tags.contains(tag.getUuid())))
            .filter(asset -> types.isEmpty() || (asset.getAssetType() != null && types.contains(asset.getAssetType().getUuid())))
            .filter(asset -> areas.isEmpty() || asset.getAreas().stream().anyMatch(area -> areas.contains(area.getUuid())))
            .toList();
    }

    private Set<Long> withDescendants(Location root) {
        Map<Long, List<Location>> children = new HashMap<>();
        for (Location location : locationRepository.findByDeletedFalse()) {
            if (location.getParentLocation() != null) {
                children.computeIfAbsent(location.getParentLocation().getId(), key -> new ArrayList<>()).add(location);
            }
        }
        Set<Long> ids = new HashSet<>();
        List<Location> queue = new ArrayList<>(List.of(root));
        while (!queue.isEmpty()) {
            Location current = queue.remove(queue.size() - 1);
            if (ids.add(current.getId())) {
                queue.addAll(children.getOrDefault(current.getId(), List.of()));
            }
        }
        return ids;
    }

    private String describe(InspectionFilter filter, Map<Long, Location> locations) {
        List<String> parts = new ArrayList<>();
        if (filter.locationUuid() != null) {
            locationRepository.findByUuid(filter.locationUuid()).ifPresent(location ->
                parts.add("Standort: " + locationPath(location, locations) + (filter.includeSubLocations() ? " (inkl. Unterstandorte)" : "")));
        }
        names(filter.tagUuids(), uuid -> tagRepository.findByUuid(uuid).map(Tag::getName).orElse(null)).ifPresent(text -> parts.add("Tags: " + text));
        names(filter.assetTypeUuids(), uuid -> assetTypeRepository.findByUuid(uuid).map(AssetType::getName).orElse(null)).ifPresent(text -> parts.add("Typen: " + text));
        names(filter.areaUuids(), uuid -> areaRepository.findByUuid(uuid).map(Area::getName).orElse(null)).ifPresent(text -> parts.add("Bereiche: " + text));
        return parts.isEmpty() ? "Alle Assets" : String.join(" · ", parts);
    }

    private static java.util.Optional<String> names(List<UUID> uuids, java.util.function.Function<UUID, String> lookup) {
        if (uuids == null || uuids.isEmpty()) {
            return java.util.Optional.empty();
        }
        String text = uuids.stream().map(lookup).filter(Objects::nonNull).collect(Collectors.joining(", "));
        return text.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(text);
    }

    // ---- items & values ----

    private InspectionItem newItem(Inspection inspection, Asset asset, boolean expected, Map<Long, Location> locations) {
        return InspectionItem.builder()
            .inspection(inspection)
            .asset(asset)
            .assetName(asset.getName())
            .invId(asset.getInvId())
            .serialNumber(asset.getSerialNumber())
            .assetTypeUuid(asset.getAssetType() == null ? null : asset.getAssetType().getUuid())
            .assetTypeName(asset.getAssetType() == null ? null : asset.getAssetType().getName())
            .locationName(asset.getLocation() == null ? null : locationPath(asset.getLocation(), locations))
            .expected(expected)
            .build();
    }

    private static void check(InspectionItem item, InspectionItemStatus status, InspectionCheckMethod method, User user) {
        item.setStatus(status);
        item.setMethod(method);
        item.setCheckedAt(OffsetDateTime.now());
        item.setCheckedByUuid(user.getUuid());
        item.setCheckedByName(displayName(user));
    }

    /** Fields of the inspection type for all assets plus those for the asset's type. */
    private static List<InspectionFieldDefinition> applicableFields(Inspection inspection, InspectionItem item) {
        if (inspection.getInspectionType() == null || item.getAsset() == null) {
            return List.of();
        }
        return inspection.getInspectionType().getFields().stream()
            .filter(field -> field.getAssetType() == null || field.getAssetType().getUuid().equals(item.getAssetTypeUuid()))
            .toList();
    }

    private static void setValue(InspectionItem item, InspectionFieldDefinition field, String value) {
        InspectionItemValue existing = item.getValues().stream()
            .filter(entry -> entry.getFieldUuid().equals(field.getUuid()))
            .findFirst()
            .orElse(null);
        if (value == null || value.isBlank()) {
            if (existing != null) {
                item.getValues().remove(existing);
            }
            return;
        }
        if (existing == null) {
            existing = InspectionItemValue.builder().item(item).fieldUuid(field.getUuid()).build();
            item.getValues().add(existing);
        }
        existing.setFieldName(field.getName());
        existing.setFieldType(field.getFieldType());
        existing.setSortOrder(field.getSortOrder());
        existing.setValue(value.length() > 4000 ? value.substring(0, 4000) : value);
    }

    // ---- mapping ----

    private InspectionTypeResponse toResponse(InspectionType type) {
        return new InspectionTypeResponse(
            type.getUuid(),
            type.getName(),
            type.getDescription(),
            type.getColor(),
            type.getFields().stream().map(InspectionService::toResponse).toList(),
            inspectionRepository.countByInspectionType(type)
        );
    }

    private static InspectionFieldResponse toResponse(InspectionFieldDefinition field) {
        AssetType assetType = field.getAssetType();
        return new InspectionFieldResponse(
            field.getUuid(),
            assetType == null ? null : assetType.getUuid(),
            assetType == null ? null : assetType.getName(),
            field.getName(),
            field.getFieldType(),
            field.getOptionsJson(),
            field.isRequired(),
            field.getSortOrder()
        );
    }

    private InspectionSummaryResponse toSummary(Inspection inspection) {
        int expected = 0;
        int present = 0;
        int missing = 0;
        int pending = 0;
        int unexpected = 0;
        for (InspectionItem item : inspection.getItems()) {
            if (!item.isExpected()) {
                unexpected++;
                continue;
            }
            expected++;
            switch (item.getStatus()) {
                case PRESENT -> present++;
                case MISSING -> missing++;
                case PENDING -> pending++;
            }
        }
        return new InspectionSummaryResponse(
            inspection.getUuid(),
            inspection.getTitle(),
            inspection.getInspectionType() == null ? null : inspection.getInspectionType().getUuid(),
            inspection.getTypeName(),
            inspection.getStatus(),
            inspection.getFilterSummary(),
            inspection.getCreatedAt(),
            inspection.getCreatedByName(),
            inspection.getCompletedAt(),
            inspection.getCompletedByName(),
            new InspectionCounts(expected, present, missing, pending, unexpected)
        );
    }

    private InspectionDetailResponse toDetail(Inspection inspection) {
        Map<Long, Location> locations = locationsById();
        List<InspectionFieldResponse> fields = inspection.getInspectionType() == null
            ? List.of()
            : inspection.getInspectionType().getFields().stream().map(InspectionService::toResponse).toList();
        InspectionFilter filter = new InspectionFilter(
            inspection.getFilterLocationUuid(),
            inspection.isFilterIncludeSubLocations(),
            split(inspection.getFilterTagUuids()),
            split(inspection.getFilterAssetTypeUuids()),
            split(inspection.getFilterAreaUuids())
        );
        return new InspectionDetailResponse(
            toSummary(inspection),
            inspection.getComment(),
            filter,
            fields,
            inspection.getItems().stream().map(item -> toResponse(item, locations)).toList()
        );
    }

    private InspectionItemResponse toResponse(InspectionItem item, Map<Long, Location> locations) {
        Asset asset = item.getAsset();
        // unexpected assets show where they actually belong now
        String locationName = !item.isExpected() && asset != null && asset.getLocation() != null
            ? locationPath(asset.getLocation(), locations)
            : item.getLocationName();
        return new InspectionItemResponse(
            item.getUuid(),
            asset == null ? null : asset.getUuid(),
            item.getAssetName(),
            item.getInvId(),
            item.getSerialNumber(),
            item.getAssetTypeUuid(),
            item.getAssetTypeName(),
            locationName,
            item.isExpected(),
            item.getStatus(),
            item.getMethod(),
            item.getScannedCode(),
            item.getCheckedAt(),
            item.getCheckedByName(),
            item.getNote(),
            item.getValues().stream()
                .map(value -> new InspectionItemValueResponse(value.getFieldUuid(), value.getFieldName(), value.getFieldType(), value.getValue()))
                .toList()
        );
    }

    // ---- helpers ----

    private Map<Long, Location> locationsById() {
        return locationRepository.findAll().stream().collect(Collectors.toMap(Location::getId, location -> location));
    }

    /** "Gebäude A / 1. Stock / Raum 12" */
    private static String locationPath(Location location, Map<Long, Location> locations) {
        List<String> names = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        Location current = location;
        while (current != null && seen.add(current.getId())) {
            names.add(0, current.getName());
            Location parent = current.getParentLocation();
            current = parent == null ? null : locations.getOrDefault(parent.getId(), parent);
        }
        return String.join(" / ", names);
    }

    private Inspection openInspection(UUID uuid) {
        Inspection inspection = inspectionOr404(uuid);
        if (inspection.isCompleted()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Die Prüfung ist abgeschlossen und kann nicht mehr geändert werden.");
        }
        return inspection;
    }

    private Inspection inspectionOr404(UUID uuid) {
        return inspectionRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Prüfung nicht gefunden"));
    }

    private InspectionType typeOr404(UUID uuid) {
        return typeRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Prüfungsart nicht gefunden"));
    }

    private static InspectionItem itemOr404(Inspection inspection, UUID itemUuid) {
        return inspection.getItems().stream()
            .filter(item -> item.getUuid().equals(itemUuid))
            .findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Eintrag nicht gefunden"));
    }

    private static void requireInspect(AccessContext access) {
        require(access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.INSPECT));
    }

    private static void requireTypesVisible(AccessContext access) {
        require(access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.INSPECT)
            || access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.VIEW));
    }

    private static void require(boolean allowed) {
        PermissionService.require(allowed);
    }

    private static String requireName(String name) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name ist erforderlich.");
        }
        return name.trim();
    }

    private static String displayName(User user) {
        return user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getUsername() : user.getDisplayName();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Set<UUID> toSet(Collection<UUID> uuids) {
        return uuids == null ? Set.of() : new HashSet<>(uuids);
    }

    private static String join(List<UUID> uuids) {
        return uuids == null || uuids.isEmpty() ? null : uuids.stream().map(UUID::toString).collect(Collectors.joining(","));
    }

    private static List<UUID> split(String value) {
        return value == null || value.isBlank() ? List.of() : Arrays.stream(value.split(",")).map(UUID::fromString).toList();
    }
}
