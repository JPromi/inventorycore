package com.jpromi.inventorycore.service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Comparator;
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

import com.jpromi.inventorycore.dto.AuditDetail;
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
import com.jpromi.inventorycore.dto.InspectionPhotoRequest;
import com.jpromi.inventorycore.dto.InspectionPhotoResponse;
import com.jpromi.inventorycore.dto.InspectionScanCandidate;
import com.jpromi.inventorycore.dto.InspectionScanResponse;
import com.jpromi.inventorycore.dto.InspectionSummaryResponse;
import com.jpromi.inventorycore.dto.InspectionTypeRequest;
import com.jpromi.inventorycore.dto.InspectionTypeResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetImage;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.Inspection;
import com.jpromi.inventorycore.entity.InspectionFieldDefinition;
import com.jpromi.inventorycore.entity.InspectionItem;
import com.jpromi.inventorycore.entity.InspectionItemPhoto;
import com.jpromi.inventorycore.entity.InspectionItemValue;
import com.jpromi.inventorycore.entity.InspectionType;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AssetFieldType;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.enums.ImageKind;
import com.jpromi.inventorycore.enums.InspectionCheckMethod;
import com.jpromi.inventorycore.enums.InspectionCondition;
import com.jpromi.inventorycore.enums.InspectionItemStatus;
import com.jpromi.inventorycore.enums.InspectionMode;
import com.jpromi.inventorycore.enums.InspectionPhotoTarget;
import com.jpromi.inventorycore.enums.InspectionStatus;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetInspectionScheduleRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.InspectionItemRepository;
import com.jpromi.inventorycore.repository.InspectionRepository;
import com.jpromi.inventorycore.repository.InspectionTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.StoredFileRepository;
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
    private final AssetInspectionScheduleRepository scheduleRepository;
    private final InspectionScheduleService scheduleService;
    private final StoredFileRepository fileRepository;
    private final AuditService audit;

    public InspectionService(
        InspectionTypeRepository typeRepository,
        InspectionRepository inspectionRepository,
        AssetRepository assetRepository,
        AssetTypeRepository assetTypeRepository,
        LocationRepository locationRepository,
        TagRepository tagRepository,
        AreaRepository areaRepository,
        ScanResolver scanResolver,
        InspectionItemRepository itemRepository,
        AssetInspectionScheduleRepository scheduleRepository,
        InspectionScheduleService scheduleService,
        StoredFileRepository fileRepository,
        AuditService audit
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
        this.scheduleRepository = scheduleRepository;
        this.scheduleService = scheduleService;
        this.fileRepository = fileRepository;
        this.audit = audit;
    }

    // ---- inspection types ----

    @Transactional(readOnly = true)
    public List<InspectionTypeResponse> types(AccessContext access) {
        requireTypesVisible(access);
        return typeRepository.findAll().stream()
            .filter(type -> canSee(access, type))
            .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
            .map(type -> toResponse(type, access))
            .toList();
    }

    @Transactional(readOnly = true)
    public InspectionTypeResponse type(AccessContext access, UUID uuid) {
        requireTypesVisible(access);
        InspectionType type = typeOr404(uuid);
        require(canSee(access, type));
        return toResponse(type, access);
    }

    @Transactional
    public InspectionTypeResponse createType(AccessContext access, InspectionTypeRequest request) {
        require(access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT)
            || access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.CREATE));
        InspectionType type = InspectionType.builder().name(requireName(request.name())).build();
        applyType(type, request, access);
        // only for areas the user manages, in every chosen area; without areas (= all) only with a right for all areas
        requireAreas(canManageAll(access, type.getAreas(), PermissionAction.CREATE) || canManageAll(access, type.getAreas(), PermissionAction.EDIT));
        InspectionTypeResponse created = toResponse(typeRepository.save(type), access);
        audit.log(AuditAction.CREATE, AuditObjectType.INSPECTION_TYPE, created.uuid(), created.name());
        return created;
    }

    @Transactional
    public InspectionTypeResponse updateType(AccessContext access, UUID uuid, InspectionTypeRequest request) {
        InspectionType type = typeOr404(uuid);
        require(canManage(access, type, PermissionAction.EDIT));
        InspectionTypeResponse before = toResponse(type, access);
        Set<Area> oldAreas = new java.util.HashSet<>(type.getAreas());
        applyType(type, request, access);
        // every added or removed area needs the right too (rolls back the changes otherwise)
        Set<Area> changed = new java.util.HashSet<>(oldAreas);
        changed.addAll(type.getAreas());
        changed.removeIf(area -> oldAreas.contains(area) && type.getAreas().contains(area));
        requireAreas((changed.isEmpty() || canManageAll(access, changed, PermissionAction.EDIT))
            && (!type.getAreas().isEmpty() || access.canEverywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT)));
        InspectionTypeResponse after = toResponse(typeRepository.save(type), access);
        audit.logChanges(AuditObjectType.INSPECTION_TYPE, after.uuid(), after.name(), before, after);
        return after;
    }

    @Transactional
    public void deleteType(AccessContext access, UUID uuid) {
        InspectionType type = typeOr404(uuid);
        require(canManage(access, type, PermissionAction.DELETE));
        inspectionRepository.detachType(type);
        scheduleRepository.deleteByInspectionType(type);
        typeRepository.delete(type);
        audit.log(AuditAction.DELETE, AuditObjectType.INSPECTION_TYPE, type.getUuid(), type.getName());
    }

    private void applyType(InspectionType type, InspectionTypeRequest request, AccessContext access) {
        Area protocolArea = request.protocolAreaUuid() == null ? null : areaRepository.findByUuid(request.protocolAreaUuid())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Bereich"));
        if (protocolArea != null) {
            require(access.can(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT, Set.of(protocolArea))
                || access.can(PermissionResourceType.ASSET_TYPE, PermissionAction.CREATE, Set.of(protocolArea)));
        }
        type.setProtocolArea(protocolArea);
        type.setName(requireName(request.name()));
        type.setDescription(blankToNull(request.description()));
        type.setColor(blankToNull(request.color()));
        type.setIncludeChildAssets(request.includeChildAssets());
        type.getDefaultAssetTypes().clear();
        if (request.defaultAssetTypeUuids() != null) {
            for (UUID uuid : request.defaultAssetTypeUuids()) {
                type.getDefaultAssetTypes().add(assetTypeRepository.findByUuid(uuid).filter(entry -> !entry.isDeleted())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Typ " + uuid)));
            }
        }
        type.getDefaultLocations().clear();
        if (request.defaultLocationUuids() != null) {
            for (UUID uuid : request.defaultLocationUuids()) {
                type.getDefaultLocations().add(locationRepository.findByUuid(uuid).filter(entry -> !entry.isDeleted())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Standort " + uuid)));
            }
        }
        type.getRecurringTags().clear();
        if (request.recurringTagUuids() != null) {
            for (UUID uuid : request.recurringTagUuids()) {
                type.getRecurringTags().add(tagRepository.findByUuid(uuid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Tag " + uuid)));
            }
        }
        type.getDefaultTags().clear();
        if (request.defaultTagUuids() != null) {
            for (UUID tagUuid : request.defaultTagUuids()) {
                type.getDefaultTags().add(tagRepository.findByUuid(tagUuid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Tag " + tagUuid)));
            }
        }
        type.setMode(request.mode() == null ? InspectionMode.INVENTORY : request.mode());
        // single checks are always about whether the device is in order
        type.setCheckFunction(type.getMode() == InspectionMode.INVENTORY && Boolean.TRUE.equals(request.checkFunction()));
        boolean recurring = request.intervalValue() != null && request.intervalValue() > 0 && request.intervalUnit() != null;
        type.setIntervalValue(recurring ? request.intervalValue() : null);
        type.setIntervalUnit(recurring ? request.intervalUnit() : null);
        type.getAssetTypes().clear();
        if (request.assetTypeUuids() != null) {
            for (UUID assetTypeUuid : request.assetTypeUuids()) {
                type.getAssetTypes().add(assetTypeRepository.findByUuid(assetTypeUuid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Typ " + assetTypeUuid)));
            }
        }
        type.getAreas().clear();
        if (request.areaUuids() != null) {
            for (UUID areaUuid : request.areaUuids()) {
                type.getAreas().add(areaRepository.findByUuid(areaUuid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Bereich " + areaUuid)));
            }
        }

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
        return inspectionRepository.findAllByOrderByCreatedAtDesc().stream()
            .filter(inspection -> canUseInspection(access, inspection))
            .map(this::toSummary)
            .toList();
    }

    @Transactional(readOnly = true)
    public InspectionDetailResponse inspection(AccessContext access, UUID uuid) {
        requireInspect(access);
        return toDetail(usableInspection(access, uuid), access);
    }

    /** Assets the filters would select, without creating anything (for the preview when starting). */
    @Transactional(readOnly = true)
    public int preview(AccessContext access, InspectionCreateRequest request) {
        requireInspect(access);
        InspectionType type = request.inspectionTypeUuid() == null ? null : usableType(access, request.inspectionTypeUuid());
        return selectAssets(access, type, filterOf(request, type), onlyDue(request, type), request.dueWithinDays(), includeChildren(request, type)).size();
    }

    /** Assets an inspection starts with: the filters, the types of the inspection and optionally only due ones. */
    private List<Asset> selectAssets(AccessContext access, InspectionType type, InspectionFilter filter, boolean onlyDue, Integer dueWithinDays, boolean includeChildAssets) {
        List<Asset> assets = expectedAssets(access, filter).stream()
            .filter(asset -> type == null || type.appliesTo(asset))
            .toList();
        if (onlyDue && type != null) {
            Set<UUID> due = scheduleService.dueAssetUuids(assets, type,
                dueWithinDays == null ? InspectionScheduleService.DUE_SOON_DAYS : dueWithinDays);
            assets = assets.stream().filter(asset -> due.contains(asset.getUuid())).toList();
        }
        if (!includeChildAssets || assets.isEmpty()) {
            return assets;
        }
        Map<UUID, List<Asset>> children = new HashMap<>();
        for (Asset asset : assetRepository.findByDeletedFalse()) {
            if (asset.getParentAsset() != null) {
                children.computeIfAbsent(asset.getParentAsset().getUuid(), key -> new ArrayList<>()).add(asset);
            }
        }
        List<Asset> selected = new ArrayList<>(assets);
        Set<UUID> visited = new HashSet<>();
        assets.forEach(asset -> visited.add(asset.getUuid()));
        List<Asset> queue = new ArrayList<>(assets);
        for (int index = 0; index < queue.size(); index++) {
            for (Asset child : children.getOrDefault(queue.get(index).getUuid(), List.of())) {
                if (!visited.add(child.getUuid())) {
                    continue;
                }
                queue.add(child);
                if (child.isInspectionRequired() && access.canViewAsset(child)
                    && access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, child.getAreas())) {
                    selected.add(child);
                }
            }
        }
        return selected;
    }

    private static InspectionFilter filterOf(InspectionCreateRequest request, InspectionType type) {
        InspectionFilter filter = request.filter() == null
            ? new InspectionFilter(null, true, List.of(), List.of(), List.of()) : request.filter();
        if (type == null) return filter;
        return new InspectionFilter(filter.locationUuid(), filter.includeSubLocations(),
            mergeDefaults(filter.tagUuids(), type.getDefaultTags().stream().map(Tag::getUuid).toList()),
            mergeDefaults(filter.assetTypeUuids(), type.getDefaultAssetTypes().stream().filter(entry -> !entry.isDeleted()).map(AssetType::getUuid).toList()),
            filter.areaUuids(),
            mergeDefaults(filter.locationUuids(), type.getDefaultLocations().stream().filter(entry -> !entry.isDeleted()).map(Location::getUuid).toList()));
    }

    private static List<UUID> mergeDefaults(List<UUID> values, List<UUID> defaults) {
        Set<UUID> result = new java.util.LinkedHashSet<>(defaults);
        if (values != null) result.addAll(values);
        return new ArrayList<>(result);
    }

    private static boolean includeChildren(InspectionCreateRequest request, InspectionType type) {
        return request.includeChildAssets() == null ? type != null && type.isIncludeChildAssets() : request.includeChildAssets();
    }

    private static boolean onlyDue(InspectionCreateRequest request, InspectionType type) {
        return Boolean.TRUE.equals(request.onlyDue()) && type != null && type.isRecurring();
    }

    @Transactional
    public InspectionDetailResponse create(AccessContext access, User user, InspectionCreateRequest request) {
        requireInspect(access);
        InspectionType type = request.inspectionTypeUuid() == null ? null : usableType(access, request.inspectionTypeUuid());
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte eine Prüfungsvorlage wählen.");
        }
        InspectionFilter filter = filterOf(request, type);
        Area area = type.getProtocolArea() != null ? type.getProtocolArea() : request.areaUuid() == null
            ? areaRepository.findFirstByDefaultAreaTrue().orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte einen Bereich wählen."))
            : areaRepository.findByUuid(request.areaUuid()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Bereich"));
        require(access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, Set.of(area)));
        boolean onlyDue = onlyDue(request, type);
        List<Asset> assets = selectAssets(access, type, filter, onlyDue, request.dueWithinDays(), includeChildren(request, type));
        Map<Long, Location> locations = locationsById();
        String summary = describe(filter, locations);
        if (includeChildren(request, type)) {
            summary += " · einschließlich untergeordneter Assets";
        }
        if (!type.getAssetTypes().isEmpty()) {
            summary = summary + " · nur " + type.getAssetTypes().stream().map(AssetType::getName).sorted().collect(Collectors.joining(", "));
        }
        if (!type.getAreas().isEmpty()) {
            summary = summary + " · Bereich " + type.getAreas().stream().map(Area::getName).sorted().collect(Collectors.joining(", "));
        }
        if (onlyDue) {
            summary = summary + " · nur fällige";
        }
        Inspection inspection = Inspection.builder()
            .area(area)
            .inspectionType(type)
            .mode(type.getMode())
            .checkFunction(type.getMode() == InspectionMode.INVENTORY
                && (request.checkFunction() == null ? type.isCheckFunction() : request.checkFunction()))
            .typeName(type.getName())
            .title(blankToNull(request.title()) == null ? type.getName() : request.title().trim())
            .filterLocationUuid(filter.locationUuid())
            .filterLocationUuids(join(filter.locationUuids()))
            .filterIncludeSubLocations(filter.includeSubLocations())
            .filterTagUuids(join(filter.tagUuids()))
            .filterAssetTypeUuids(join(filter.assetTypeUuids()))
            .filterAreaUuids(join(filter.areaUuids()))
            .filterSummary(summary)
            .createdByUuid(user.getUuid())
            .createdByName(displayName(user))
            .build();
        assets.stream()
            .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
            .forEach(asset -> inspection.getItems().add(newItem(inspection, asset, true, locations)));
        InspectionDetailResponse created = toDetail(inspectionRepository.save(inspection), access);
        audit.log(AuditAction.CREATE, AuditObjectType.INSPECTION, inspection.getUuid(), inspection.getTitle(), AuditDetail.event(
            "INSPECTION_STARTED",
            "inspectionType", type.getName(),
            "protocolArea", area.getName(),
            "mode", type.getMode().name(),
            "checkFunction", inspection.isCheckFunction() ? true : null,
            "expected", assets.size(),
            "location", filter.locationUuid() == null ? null : locationRepository.findByUuid(filter.locationUuid()).map(Location::getName).orElse(null),
            "includeSubLocations", filter.locationUuid() == null ? null : filter.includeSubLocations(),
            "tags", nameList(filter.tagUuids(), uuid -> tagRepository.findByUuid(uuid).map(Tag::getName)),
            "assetTypes", nameList(filter.assetTypeUuids(), uuid -> assetTypeRepository.findByUuid(uuid).map(AssetType::getName)),
            "areas", nameList(filter.areaUuids(), uuid -> areaRepository.findByUuid(uuid).map(Area::getName)),
            "onlyDue", onlyDue ? true : null));
        return created;
    }

    @Transactional
    public InspectionScanResponse scan(AccessContext access, User user, UUID uuid, String code) {
        return scan(access, user, uuid, code, null);
    }

    /** {@code chosenAsset}: the user's choice after an AMBIGUOUS answer, or null. */
    @Transactional
    public InspectionScanResponse scan(AccessContext access, User user, UUID uuid, String code, UUID chosenAsset) {
        InspectionScanResponse response = scanCode(access, user, uuid, code, chosenAsset);
        InspectionItemResponse item = response.item();
        if (item != null && item.assetUuid() != null) {
            String title = inspectionRepository.findByUuid(uuid).map(Inspection::getTitle).orElse("?");
            audit.log(AuditAction.SCAN, AuditObjectType.ASSET, item.assetUuid(), item.assetName(),
                AuditDetail.event("INSPECTION_SCAN", "inspection", title, "inspectionUuid", uuid.toString(), "outcome", response.outcome()));
        }
        return response;
    }

    private InspectionScanResponse scanCode(AccessContext access, User user, UUID uuid, String code, UUID chosenAsset) {
        requireInspect(access);
        Inspection inspection = openInspection(access, uuid);
        ScanResolver.Resolution resolved = scanResolver.resolve(access, code);
        Map<Long, Location> locations = locationsById();

        // several assets share the code (e.g. the same serial number): nothing is recorded until the user picks one
        if (chosenAsset != null) {
            List<Asset> chosen = resolved.assets().stream().filter(asset -> asset.getUuid().equals(chosenAsset)).toList();
            if (chosen.isEmpty()) {
                return new InspectionScanResponse("IGNORED", "Das gewählte Asset passt nicht zu diesem Code.", null);
            }
            resolved = new ScanResolver.Resolution(resolved.code(), resolved.matchedBy(), chosen, List.of());
        } else if (resolved.assets().size() > 1) {
            String scanned = resolved.code();
            List<InspectionScanCandidate> candidates = resolved.assets().stream()
                .sorted(Comparator.comparing(Asset::getName, String.CASE_INSENSITIVE_ORDER))
                .map(asset -> new InspectionScanCandidate(
                    asset.getUuid(),
                    asset.getName(),
                    asset.getInvId(),
                    asset.getAssetType() == null ? null : asset.getAssetType().getName(),
                    asset.getLocation() == null ? null : locationPath(asset.getLocation(), locations),
                    matchedField(asset, scanned),
                    inspection.getItems().stream().anyMatch(item -> item.getAsset() != null && item.getAsset().getId().equals(asset.getId()))))
                .toList();
            return new InspectionScanResponse("AMBIGUOUS", candidates.size() + " Assets passen zu „" + scanned + "“. Welches ist es?", null, candidates);
        }
        ScanResolver.Resolution resolution = resolved;

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
        if (!canInspect(access, asset)) {
            // visible, but not in an area the user may inspect: nothing is recorded (it would also count as a check)
            return new InspectionScanResponse("IGNORED", "Keine Berechtigung, " + asset.getName() + " zu prüfen.", null);
        }
        InspectionItem item = inspection.getItems().stream()
            .filter(entry -> entry.getAsset() != null && entry.getAsset().getId().equals(asset.getId()))
            .findFirst()
            .orElse(null);

        var policy = item == null ? asset.getInspectionPolicy() : item.getInspectionPolicy();
        if (policy == com.jpromi.inventorycore.enums.AssetInspectionPolicy.EXCLUDED) {
            return new InspectionScanResponse("IGNORED", asset.getName() + " ist von Prüfungen ausgenommen.", null);
        }
        if (policy == com.jpromi.inventorycore.enums.AssetInspectionPolicy.MANUAL) {
            return new InspectionScanResponse("IGNORED", asset.getName() + " wird ohne Label manuell geprüft.",
                item == null ? null : toResponse(item, locations));
        }

        if (inspection.getMode() == InspectionMode.CHECK) {
            if (item != null) {
                return new InspectionScanResponse("OPENED", asset.getName() + " ist bereits in der Prüfung.", toResponse(item, locations));
            }
            InspectionItem added = newItem(inspection, asset, true, locations);
            added.setScannedCode(resolution.code());
            inspection.getItems().add(added);
            inspectionRepository.save(inspection);
            InspectionType type = inspection.getInspectionType();
            boolean typeFits = type == null || type.appliesTo(asset.getAssetType());
            boolean areaFits = type == null || type.coversAreas(asset.getAreas());
            String warning = !typeFits ? " – der Typ ist für diese Prüfung eigentlich nicht vorgesehen."
                : !areaFits ? " – das Gerät liegt nicht im Bereich dieser Prüfung." : null;
            return new InspectionScanResponse(warning == null ? "ADDED" : "ADDED_OTHER_TYPE",
                asset.getName() + " hinzugefügt" + (warning == null ? "." : warning),
                toResponse(added, locations));
        }

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

    /** Which field of the asset the scanned code matched (the resolver compares case-insensitively). */
    private static String matchedField(Asset asset, String code) {
        if (code.equalsIgnoreCase(asset.getInvId())) {
            return "INV_ID";
        }
        if (code.equalsIgnoreCase(asset.getInventoryNumber())) {
            return "INVENTORY_NUMBER";
        }
        return code.equalsIgnoreCase(asset.getSerialNumber()) ? "SERIAL_NUMBER" : null;
    }

    @Transactional
    public InspectionItemResponse updateItem(AccessContext access, User user, UUID uuid, UUID itemUuid, InspectionItemUpdateRequest request) {
        requireInspect(access);
        Inspection inspection = openInspection(access, uuid);
        InspectionItem item = itemOr404(inspection, itemUuid);
        requireInspectItem(access, item);

        if (request.status() != null && !allowedStatus(inspection.getMode()).contains(request.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status passt nicht zur Art der Prüfung.");
        }
        if (request.status() != null && request.status() != item.getStatus()) {
            if (request.status() != InspectionItemStatus.PRESENT) {
                item.setCondition(null);
            }
            if (request.status() == InspectionItemStatus.PENDING) {
                item.setStatus(InspectionItemStatus.PENDING);
                item.setMethod(null);
                item.setCheckedAt(null);
                item.setCheckedByUuid(null);
                item.setCheckedByName(null);
            } else {
                check(item, request.status(), InspectionCheckMethod.MANUAL, user);
            }
            if (item.getAsset() != null) {
                audit.log(AuditAction.INSPECT, AuditObjectType.ASSET, item.getAsset().getUuid(), item.getAssetName(), AuditDetail.event(
                    "INSPECTION_RESULT", "inspection", inspection.getTitle(), "inspectionUuid", uuid.toString(), "status", request.status().name()));
            }
        }
        if (request.condition() != null) {
            setCondition(inspection, item, request.condition(), user, uuid);
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

    /** Adds a device to a single-check inspection (from the search, without scanning). */
    @Transactional
    public InspectionItemResponse addItem(AccessContext access, UUID uuid, UUID assetUuid) {
        requireInspect(access);
        Inspection inspection = openInspection(access, uuid);
        Asset asset = assetRepository.findByUuid(assetUuid)
            .filter(entry -> !entry.isDeleted() && access.canViewAsset(entry))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset nicht gefunden"));
        if (!canInspect(access, asset)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Keine Berechtigung, dieses Asset zu prüfen.");
        }
        if (!asset.isInspectionRequired()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dieses Asset ist von Prüfungen ausgenommen.");
        }
        Map<Long, Location> locations = locationsById();
        InspectionItem existing = inspection.getItems().stream()
            .filter(entry -> entry.getAsset() != null && entry.getAsset().getId().equals(asset.getId()))
            .findFirst()
            .orElse(null);
        if (existing != null) {
            return toResponse(existing, locations);
        }
        InspectionItem item = newItem(inspection, asset, true, locations);
        inspection.getItems().add(item);
        inspectionRepository.save(inspection);
        audit.log(AuditAction.INSPECT, AuditObjectType.ASSET, asset.getUuid(), asset.getName(), AuditDetail.event(
            "INSPECTION_ITEM_ADDED", "inspection", inspection.getTitle(), "inspectionUuid", uuid.toString()));
        return toResponse(item, locations);
    }

    /**
     * Photo of an asset during the inspection: either kept in the protocol (at the item) or added
     * to the asset's images, which needs the right to edit the asset. Returns the item afterwards.
     */
    @Transactional
    public InspectionItemResponse addPhoto(AccessContext access, User user, UUID uuid, UUID itemUuid, InspectionPhotoRequest request) {
        requireInspect(access);
        Inspection inspection = openInspection(access, uuid);
        InspectionItem item = itemOr404(inspection, itemUuid);
        requireInspectItem(access, item);
        if (request.fileUuid() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Kein Bild angegeben.");
        }
        StoredFile file = fileRepository.findByUuid(request.fileUuid())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bild nicht gefunden."));
        // only a fresh upload: photos of other objects cannot be taken over by their file id
        if (fileRepository.isAttached(file)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Das Bild gehört bereits zu einem anderen Eintrag.");
        }

        if (request.target() == InspectionPhotoTarget.ASSET) {
            Asset asset = item.getAsset();
            if (asset == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Zu einem unbekannten Code gibt es kein Asset.");
            }
            if (!access.can(PermissionResourceType.ASSET, PermissionAction.EDIT, asset.getAreas())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Keine Berechtigung, dieses Asset zu bearbeiten.");
            }
            // the first image becomes the cover
            asset.getImages().add(AssetImage.builder()
                .asset(asset)
                .kind(asset.getImages().isEmpty() ? ImageKind.THUMBNAIL : ImageKind.GALLERY)
                .file(file)
                .fileName(file.getOriginalName())
                .contentType(file.getContentType())
                .sortOrder(asset.getImages().size())
                .build());
            assetRepository.save(asset);
            audit.log(AuditAction.PHOTO, AuditObjectType.ASSET, asset.getUuid(), asset.getName(), AuditDetail.event(
                "PHOTO_ADDED", "target", "ASSET", "inspection", inspection.getTitle(), "inspectionUuid", uuid.toString(), "fileUuid", file.getUuid().toString()));
            return toResponse(item, locationsById());
        }

        item.getPhotos().add(InspectionItemPhoto.builder()
            .item(item)
            .file(file)
            .takenByUuid(user.getUuid())
            .takenByName(displayName(user))
            .build());
        inspectionRepository.save(inspection);
        if (item.getAsset() != null) {
            audit.log(AuditAction.PHOTO, AuditObjectType.ASSET, item.getAsset().getUuid(), item.getAssetName(), AuditDetail.event(
                "PHOTO_ADDED", "target", "INSPECTION", "inspection", inspection.getTitle(), "inspectionUuid", uuid.toString(), "fileUuid", file.getUuid().toString()));
        }
        return toResponse(item, locationsById());
    }

    @Transactional
    public InspectionItemResponse removePhoto(AccessContext access, UUID uuid, UUID itemUuid, UUID photoUuid) {
        requireInspect(access);
        Inspection inspection = openInspection(access, uuid);
        InspectionItem item = itemOr404(inspection, itemUuid);
        if (!item.getPhotos().removeIf(photo -> photo.getUuid().equals(photoUuid))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Foto nicht gefunden");
        }
        inspectionRepository.save(inspection);
        return toResponse(item, locationsById());
    }

    /** Function check: OK / DEFECT ("" clears). Checking the function means the asset is there. */
    private void setCondition(Inspection inspection, InspectionItem item, String value, User user, UUID uuid) {
        if (!inspection.isCheckFunction()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diese Prüfung prüft keine Funktion.");
        }
        InspectionCondition condition;
        try {
            condition = value.isBlank() ? null : InspectionCondition.valueOf(value);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Zustand " + value);
        }
        if (condition == item.getCondition()) {
            return;
        }
        if (condition != null && item.getStatus() != InspectionItemStatus.PRESENT) {
            check(item, InspectionItemStatus.PRESENT, InspectionCheckMethod.MANUAL, user);
        }
        item.setCondition(condition);
        if (item.getAsset() != null) {
            audit.log(AuditAction.INSPECT, AuditObjectType.ASSET, item.getAsset().getUuid(), item.getAssetName(), AuditDetail.event(
                "INSPECTION_CONDITION", "inspection", inspection.getTitle(), "inspectionUuid", uuid.toString(),
                "condition", condition == null ? "NONE" : condition.name()));
        }
    }

    private static Set<InspectionItemStatus> allowedStatus(InspectionMode mode) {
        return mode == InspectionMode.CHECK
            ? Set.of(InspectionItemStatus.PENDING, InspectionItemStatus.PASSED, InspectionItemStatus.FAILED)
            : Set.of(InspectionItemStatus.PENDING, InspectionItemStatus.PRESENT, InspectionItemStatus.MISSING);
    }

    /** Removes an item that was added by mistake; expected assets stay (mark them as missing instead). */
    @Transactional
    public void removeItem(AccessContext access, UUID uuid, UUID itemUuid) {
        requireInspect(access);
        Inspection inspection = openInspection(access, uuid);
        InspectionItem item = itemOr404(inspection, itemUuid);
        requireInspectItem(access, item);
        if (item.isExpected() && inspection.getMode() == InspectionMode.INVENTORY) {
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
        Inspection inspection = openInspection(access, uuid);
        inspection.setComment(blankToNull(comment));
        inspection.setStatus(InspectionStatus.COMPLETED);
        inspection.setCompletedAt(OffsetDateTime.now());
        inspection.setCompletedByUuid(user.getUuid());
        inspection.setCompletedByName(displayName(user));
        InspectionDetailResponse completed = toDetail(inspectionRepository.save(inspection), access);
        InspectionCounts counts = completed.summary().counts();
        audit.log(AuditAction.COMPLETE, AuditObjectType.INSPECTION, inspection.getUuid(), inspection.getTitle(), AuditDetail.event(
            "INSPECTION_COMPLETED",
            "mode", inspection.getMode().name(),
            "expected", counts.expected(),
            "present", counts.present(),
            "missing", counts.missing(),
            "passed", counts.passed(),
            "failed", counts.failed(),
            "pending", counts.pending(),
            "unexpected", counts.unexpected(),
            "defect", inspection.isCheckFunction() ? counts.defect() : null,
            "comment", inspection.getComment()));
        return completed;
    }

    @Transactional
    public void delete(AccessContext access, User user, UUID uuid) {
        Inspection inspection = usableInspection(access, uuid);
        // a completed protocol is a record; only admins may remove it. An open one: whoever started it,
        // or who may delete assets in the protocol's area.
        require(inspection.isCompleted() ? access.isAdmin()
            : user.getUuid().equals(inspection.getCreatedByUuid()) || canDeleteIn(access, inspection));
        inspectionRepository.delete(inspection);
        audit.log(AuditAction.DELETE, AuditObjectType.INSPECTION, inspection.getUuid(), inspection.getTitle(),
            AuditDetail.event("INSPECTION_DELETED", "completed", inspection.isCompleted()));
    }

    /** History for the asset detail page: all inspections the asset was part of or found in. */
    @Transactional(readOnly = true)
    public List<AssetInspectionResponse> inspectionsOfAsset(AccessContext access, UUID assetUuid) {
        requireInspect(access);
        Asset asset = assetRepository.findByUuid(assetUuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset nicht gefunden"));
        require(access.canViewAsset(asset));
        return itemRepository.findByAsset(asset).stream()
            .filter(item -> canUseInspection(access, item.getInspection()))
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
                    item.getCondition(),
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
        Set<UUID> selectedLocations = new HashSet<>(toSet(filter.locationUuids()));
        if (filter.locationUuid() != null) selectedLocations.add(filter.locationUuid());
        if (!selectedLocations.isEmpty()) {
            locationIds = new HashSet<>();
            for (UUID uuid : selectedLocations) {
                Location location = locationRepository.findByUuid(uuid).filter(entry -> !entry.isDeleted())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Standort"));
                locationIds.addAll(filter.includeSubLocations() ? withDescendants(location) : Set.of(location.getId()));
            }
        }
        Set<UUID> tags = toSet(filter.tagUuids());
        Set<UUID> types = toSet(filter.assetTypeUuids());
        Set<UUID> areas = toSet(filter.areaUuids());
        Set<Long> finalLocationIds = locationIds;

        return assetRepository.findByDeletedFalse().stream()
            .filter(Asset::isInspectionRequired)
            .filter(access::canViewAsset)
            .filter(asset -> access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, asset.getAreas()))
            .filter(asset -> finalLocationIds == null || (asset.getLocation() != null && finalLocationIds.contains(asset.getLocation().getId())))
            .filter(asset -> tags.isEmpty() || asset.getTags().stream().anyMatch(tag -> tags.contains(tag.getUuid()))
                || (asset.getAssetType() != null && asset.getAssetType().getTags().stream().anyMatch(tag -> tags.contains(tag.getUuid()))))
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
        names(filter.locationUuids(), uuid -> locationRepository.findByUuid(uuid)
            .map(location -> locationPath(location, locations)).orElse(null))
            .ifPresent(text -> parts.add("Standorte: " + text + (filter.includeSubLocations() ? " (inkl. Unterstandorte)" : "")));
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
            .parentAssetUuid(asset.getParentAsset() == null ? null : asset.getParentAsset().getUuid())
            .parentAssetNote(asset.getParentAssetNote())
            .inspectionPolicy(asset.getInspectionPolicy())
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

    private InspectionTypeResponse toResponse(InspectionType type, AccessContext access) {
        return new InspectionTypeResponse(
            type.getUuid(),
            type.getName(),
            type.getDescription(),
            type.getColor(),
            type.getMode(),
            type.getIntervalValue(),
            type.getIntervalUnit(),
            type.isCheckFunction(),
            type.getAssetTypes().stream().map(AssetType::getUuid).toList(),
            type.getAssetTypes().stream().map(AssetType::getName).sorted().toList(),
            type.getAreas().stream().map(Area::getUuid).toList(),
            type.getAreas().stream().map(Area::getName).sorted().toList(),
            canUse(access, type),
            canManage(access, type, PermissionAction.EDIT),
            canManage(access, type, PermissionAction.DELETE),
            type.getFields().stream().map(InspectionService::toResponse).toList(),
            inspectionRepository.countByInspectionType(type),
            type.getDefaultTags().stream().map(Tag::getUuid).toList(),
            type.isIncludeChildAssets(),
            type.getDefaultAssetTypes().stream().filter(entry -> !entry.isDeleted()).map(AssetType::getUuid).toList(),
            type.getDefaultLocations().stream().filter(entry -> !entry.isDeleted()).map(Location::getUuid).toList(),
            type.getRecurringTags().stream().map(Tag::getUuid).toList(),
            type.getProtocolArea() == null ? null : type.getProtocolArea().getUuid()
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
        int passed = 0;
        int failed = 0;
        int pending = 0;
        int unexpected = 0;
        int defect = 0;
        int functionUnchecked = 0;
        for (InspectionItem item : inspection.getItems()) {
            if (!item.isExpected()) {
                unexpected++;
                continue;
            }
            expected++;
            if (item.getCondition() == InspectionCondition.DEFECT) {
                defect++;
            } else if (inspection.isCheckFunction() && item.getStatus() == InspectionItemStatus.PRESENT && item.getCondition() == null) {
                functionUnchecked++;
            }
            switch (item.getStatus()) {
                case PRESENT -> present++;
                case MISSING -> missing++;
                case PASSED -> passed++;
                case FAILED -> failed++;
                case PENDING -> pending++;
            }
        }
        return new InspectionSummaryResponse(
            inspection.getUuid(),
            inspection.getTitle(),
            inspection.getInspectionType() == null ? null : inspection.getInspectionType().getUuid(),
            inspection.getTypeName(),
            inspection.getArea() != null ? List.of(inspection.getArea().getUuid()) : inspection.getInspectionType() == null ? List.of() : inspection.getInspectionType().getAreas().stream().map(Area::getUuid).toList(),
            inspection.getArea() != null ? List.of(inspection.getArea().getName()) : inspection.getInspectionType() == null ? List.of() : inspection.getInspectionType().getAreas().stream().map(Area::getName).sorted().toList(),
            inspection.getStatus(),
            inspection.getMode(),
            inspection.isCheckFunction(),
            inspection.getFilterSummary(),
            inspection.getCreatedAt(),
            inspection.getCreatedByUuid(),
            inspection.getCreatedByName(),
            inspection.getCompletedAt(),
            inspection.getCompletedByName(),
            new InspectionCounts(expected, present, missing, passed, failed, pending, unexpected, defect, functionUnchecked)
        );
    }

    /**
     * Items of assets the reader may not see are left out (a protocol of area X can contain assets of
     * other areas, e.g. found there or added by someone with rights there). Unknown codes stay.
     */
    private InspectionDetailResponse toDetail(Inspection inspection, AccessContext access) {
        Map<Long, Location> locations = locationsById();
        List<InspectionFieldResponse> fields = inspection.getInspectionType() == null
            ? List.of()
            : inspection.getInspectionType().getFields().stream().map(InspectionService::toResponse).toList();
        InspectionFilter filter = new InspectionFilter(
            inspection.getFilterLocationUuid(),
            inspection.isFilterIncludeSubLocations(),
            split(inspection.getFilterTagUuids()),
            split(inspection.getFilterAssetTypeUuids()),
            split(inspection.getFilterAreaUuids()),
            split(inspection.getFilterLocationUuids())
        );
        return new InspectionDetailResponse(
            toSummary(inspection),
            inspection.getComment(),
            filter,
            fields,
            inspection.getItems().stream()
                .filter(item -> item.getAsset() == null || access.canViewAsset(item.getAsset()))
                .map(item -> toResponse(item, locations))
                .toList()
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
            item.getCondition(),
            item.getScannedCode(),
            item.getCheckedAt(),
            item.getCheckedByName(),
            item.getNote(),
            item.getValues().stream()
                .map(value -> new InspectionItemValueResponse(value.getFieldUuid(), value.getFieldName(), value.getFieldType(), value.getValue()))
                .toList(),
            item.getPhotos().stream()
                .map(photo -> new InspectionPhotoResponse(
                    photo.getUuid(),
                    photo.getFile().getUuid(),
                    ApiMapper.fileUrl(photo.getFile(), false),
                    ApiMapper.fileUrl(photo.getFile(), true),
                    photo.getTakenAt(),
                    photo.getTakenByName()))
                .toList(),
            item.getParentAssetUuid(),
            item.getParentAssetNote(),
            item.getInspectionPolicy()
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

    private Inspection openInspection(AccessContext access, UUID uuid) {
        Inspection inspection = usableInspection(access, uuid);
        if (inspection.isCompleted()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Die Prüfung ist abgeschlossen und kann nicht mehr geändert werden.");
        }
        return inspection;
    }

    /** The inspection, if its type may be used by the user (404 otherwise, like for others' areas). */
    private Inspection usableInspection(AccessContext access, UUID uuid) {
        Inspection inspection = inspectionOr404(uuid);
        if (!canUseInspection(access, inspection)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Prüfung nicht gefunden");
        }
        return inspection;
    }

    /** A protocol photo: the protocol must be usable and the asset (if any) visible, like in the detail. */
    static boolean canSeePhoto(AccessContext access, InspectionItem item) {
        return canUseInspection(access, item.getInspection()) && (item.getAsset() == null || access.canViewAsset(item.getAsset()));
    }

    private static boolean canDeleteIn(AccessContext access, Inspection inspection) {
        return inspection.getArea() == null
            ? allows(access, inspection.getInspectionType(), PermissionResourceType.ASSET, PermissionAction.DELETE)
            : access.can(PermissionResourceType.ASSET, PermissionAction.DELETE, Set.of(inspection.getArea()));
    }

    private static boolean canUseInspection(AccessContext access, Inspection inspection) {
        return inspection.getArea() == null ? canUse(access, inspection.getInspectionType())
            : access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, Set.of(inspection.getArea()));
    }

    /**
     * Whether the user may see, start and do inspections of this type: the right to inspect in one
     * of its areas. A type without areas is for all areas and needs that right for all areas (a
     * permission without area), like inspections whose type was deleted. So someone who may only
     * inspect in "EDV" sees nothing but the EDV inspections.
     */
    public static boolean canUse(AccessContext access, InspectionType type) {
        return allows(access, type, PermissionResourceType.ASSET, PermissionAction.INSPECT)
            && (type == null || type.getProtocolArea() == null
                || access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, Set.of(type.getProtocolArea())));
    }

    /** Configuring a type (ASSET_TYPE rights) follows the same rule: in its areas, or for all areas. */
    private static boolean canManage(AccessContext access, InspectionType type, PermissionAction action) {
        return allows(access, type, PermissionResourceType.ASSET_TYPE, action);
    }

    /** The action in every one of these areas; no areas means "all areas" and needs a right without area. */
    private static boolean canManageAll(AccessContext access, Collection<Area> areas, PermissionAction action) {
        return areas.isEmpty() ? access.canEverywhere(PermissionResourceType.ASSET_TYPE, action)
            : access.canInAll(PermissionResourceType.ASSET_TYPE, action, areas);
    }

    /** Checking an asset needs the right to inspect in its areas, not only in the protocol's area. */
    private static boolean canInspect(AccessContext access, Asset asset) {
        return access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, asset.getAreas());
    }

    private static void requireInspectItem(AccessContext access, InspectionItem item) {
        if (item.getAsset() != null && !canInspect(access, item.getAsset())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Keine Berechtigung, dieses Asset zu prüfen.");
        }
    }

    /** Visible for whoever may use it or view it in the configuration. */
    private static boolean canSee(AccessContext access, InspectionType type) {
        return canUse(access, type) || canManage(access, type, PermissionAction.VIEW);
    }

    private static void requireAreas(boolean allowed) {
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Wähle Bereiche, in denen du Prüfungsvorlagen bearbeiten darfst. Ohne Bereich gilt die Prüfungsvorlage für alle Bereiche, "
                    + "dafür ist ein Recht für alle Bereiche nötig.");
        }
    }

    private static boolean allows(AccessContext access, InspectionType type, PermissionResourceType resource, PermissionAction action) {
        if (type == null || type.getAreas().isEmpty()) {
            return access.canEverywhere(resource, action);
        }
        return access.can(resource, action, type.getAreas());
    }

    private Inspection inspectionOr404(UUID uuid) {
        return inspectionRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Prüfung nicht gefunden"));
    }

    private InspectionType usableType(AccessContext access, UUID uuid) {
        InspectionType type = typeOr404(uuid);
        if (!canUse(access, type)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Für diese Prüfungsvorlage fehlt das Recht zum Prüfen in ihrem Bereich.");
        }
        return type;
    }

    private InspectionType typeOr404(UUID uuid) {
        return typeRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Prüfungsvorlage nicht gefunden"));
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

    /** Names of the referenced objects for a log entry; null when there are none. */
    private static List<String> nameList(List<UUID> uuids, java.util.function.Function<UUID, java.util.Optional<String>> lookup) {
        if (uuids == null || uuids.isEmpty()) {
            return null;
        }
        return uuids.stream().map(lookup).flatMap(java.util.Optional::stream).sorted().toList();
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
