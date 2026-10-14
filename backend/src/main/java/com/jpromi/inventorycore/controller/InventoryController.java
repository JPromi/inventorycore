package com.jpromi.inventorycore.controller;

import java.time.OffsetDateTime;
import java.text.Normalizer;
import java.util.Locale;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.AssetFieldDefinitionRequest;
import com.jpromi.inventorycore.dto.AssetFieldValueRequest;
import com.jpromi.inventorycore.dto.AssetImageRequest;
import com.jpromi.inventorycore.dto.AssetRequest;
import com.jpromi.inventorycore.dto.AssetResponse;
import com.jpromi.inventorycore.dto.AssetTypeRequest;
import com.jpromi.inventorycore.dto.AssetTypeResponse;
import com.jpromi.inventorycore.dto.LocationImageRequest;
import com.jpromi.inventorycore.dto.LocationRequest;
import com.jpromi.inventorycore.dto.LocationResponse;
import com.jpromi.inventorycore.dto.TagRequest;
import com.jpromi.inventorycore.dto.TagResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetFieldDefinition;
import com.jpromi.inventorycore.entity.AssetFieldValue;
import com.jpromi.inventorycore.entity.AssetImage;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.AssetTypeImage;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.LocationImage;
import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.StoredFileRepository;
import com.jpromi.inventorycore.repository.TagRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.PermissionService;

import static com.jpromi.inventorycore.service.PermissionService.require;

@RestController
@RequestMapping("/api")
public class InventoryController {

    private final AssetRepository assetRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LocationRepository locationRepository;
    private final TagRepository tagRepository;
    private final AreaRepository areaRepository;
    private final StoredFileRepository fileRepository;
    private final PermissionService permissionService;
    private final ApiMapper mapper;

    public InventoryController(
        AssetRepository assetRepository,
        AssetTypeRepository assetTypeRepository,
        LocationRepository locationRepository,
        TagRepository tagRepository,
        AreaRepository areaRepository,
        StoredFileRepository fileRepository,
        PermissionService permissionService,
        ApiMapper mapper
    ) {
        this.assetRepository = assetRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.locationRepository = locationRepository;
        this.tagRepository = tagRepository;
        this.areaRepository = areaRepository;
        this.fileRepository = fileRepository;
        this.permissionService = permissionService;
        this.mapper = mapper;
    }

    // ---- locations ----

    @GetMapping("/locations")
    public List<LocationResponse> locations(Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        return locationRepository.findByDeletedFalse().stream().filter(access::canViewLocation).map(mapper::toResponse).toList();
    }

    @GetMapping("/locations/{uuid}")
    public LocationResponse location(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Location location = locationOr404(uuid);
        requireVisible(access.canViewLocation(location));
        return mapper.toResponse(location);
    }

    @PostMapping("/locations")
    @ResponseStatus(HttpStatus.CREATED)
    public LocationResponse createLocation(@RequestBody LocationRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Set<Area> areas = resolveAreas(request.areaUuids());
        require(access.canInAll(PermissionResourceType.LOCATION, PermissionAction.CREATE, areas));
        Location location = Location.builder().build();
        applyLocation(access, location, request);
        location.setAreas(areas);
        return mapper.toResponse(locationRepository.save(location));
    }

    @PatchMapping("/locations/{uuid}")
    public LocationResponse updateLocation(@PathVariable UUID uuid, @RequestBody LocationRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Location location = locationOr404(uuid);
        require(access, PermissionResourceType.LOCATION, PermissionAction.EDIT, location.getAreas());
        Set<Area> areas = resolveAreas(request.areaUuids());
        requireAreaChange(access, PermissionResourceType.LOCATION, location.getAreas(), areas);
        applyLocation(access, location, request);
        location.setAreas(areas);
        return mapper.toResponse(locationRepository.save(location));
    }

    @DeleteMapping("/locations/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLocation(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Location location = locationOr404(uuid);
        require(access, PermissionResourceType.LOCATION, PermissionAction.DELETE, location.getAreas());
        location.setDeleted(true);
        location.setDeletedAt(OffsetDateTime.now());
        locationRepository.save(location);
    }

    // ---- asset types ----

    @GetMapping("/asset-types")
    public List<AssetTypeResponse> assetTypes(Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        return assetTypeRepository.findByDeletedFalse().stream().filter(access::canViewAssetType).map(mapper::toResponse).toList();
    }

    @GetMapping("/asset-types/{uuid}")
    public AssetTypeResponse assetType(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        AssetType type = assetTypeOr404(uuid);
        requireVisible(access.canViewAssetType(type));
        return mapper.toResponse(type);
    }

    @PostMapping("/asset-types")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetTypeResponse createAssetType(@RequestBody AssetTypeRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Set<Area> areas = resolveAreas(request.areaUuids());
        require(access.canInAll(PermissionResourceType.ASSET_TYPE, PermissionAction.CREATE, areas));
        AssetType type = AssetType.builder().build();
        applyAssetType(type, request);
        type.setAreas(areas);
        return mapper.toResponse(assetTypeRepository.save(type));
    }

    @PatchMapping("/asset-types/{uuid}")
    public AssetTypeResponse updateAssetType(@PathVariable UUID uuid, @RequestBody AssetTypeRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        AssetType type = assetTypeOr404(uuid);
        require(access, PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT, type.getAreas());
        Set<Area> areas = resolveAreas(request.areaUuids());
        requireAreaChange(access, PermissionResourceType.ASSET_TYPE, type.getAreas(), areas);
        applyAssetType(type, request);
        type.setAreas(areas);
        return mapper.toResponse(assetTypeRepository.save(type));
    }

    @DeleteMapping("/asset-types/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAssetType(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        AssetType type = assetTypeOr404(uuid);
        require(access, PermissionResourceType.ASSET_TYPE, PermissionAction.DELETE, type.getAreas());
        type.setDeleted(true);
        type.setDeletedAt(OffsetDateTime.now());
        assetTypeRepository.save(type);
    }

    // ---- tags (global, not bound to areas) ----

    @GetMapping("/tags")
    public List<TagResponse> tags(Authentication authentication) {
        permissionService.context(authentication);
        return tagRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @PostMapping("/tags")
    @ResponseStatus(HttpStatus.CREATED)
    public TagResponse createTag(@RequestBody TagRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        // anyone who maintains assets or types may create new tags while tagging
        require(access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.CREATE)
            || access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT)
            || access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.CREATE)
            || access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.EDIT));
        Tag tag = Tag.builder().name(request.name()).color(request.color()).build();
        return mapper.toResponse(tagRepository.save(tag));
    }

    @PatchMapping("/tags/{uuid}")
    public TagResponse updateTag(@PathVariable UUID uuid, @RequestBody TagRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        require(access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT));
        Tag tag = tagOr404(uuid);
        tag.setName(request.name());
        tag.setColor(request.color());
        return mapper.toResponse(tagRepository.save(tag));
    }

    @DeleteMapping("/tags/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteTag(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        require(access.canAnywhere(PermissionResourceType.ASSET_TYPE, PermissionAction.DELETE));
        Tag tag = tagOr404(uuid);
        tagRepository.detachFromAssets(tag.getId());
        tagRepository.detachFromAssetTypes(tag.getId());
        tagRepository.delete(tag);
    }

    // ---- assets ----

    @GetMapping("/assets")
    public List<AssetResponse> assets(Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        return assetRepository.findByDeletedFalse().stream().filter(access::canViewAsset).map(mapper::toResponse).toList();
    }

    @GetMapping("/assets/{uuid}")
    public AssetResponse asset(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Asset asset = assetOr404(uuid);
        requireVisible(access.canViewAsset(asset));
        return mapper.toResponse(asset);
    }

    @PostMapping("/assets")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetResponse createAsset(@RequestBody AssetRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Set<Area> areas = resolveAreas(request.areaUuids());
        require(access.canInAll(PermissionResourceType.ASSET, PermissionAction.CREATE, areas));
        Asset asset = Asset.builder().build();
        applyAsset(access, asset, request);
        asset.setAreas(areas);
        return mapper.toResponse(assetRepository.save(asset));
    }

    @PatchMapping("/assets/{uuid}")
    public AssetResponse updateAsset(@PathVariable UUID uuid, @RequestBody AssetRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Asset asset = assetOr404(uuid);
        require(access, PermissionResourceType.ASSET, PermissionAction.EDIT, asset.getAreas());
        Set<Area> areas = resolveAreas(request.areaUuids());
        requireAreaChange(access, PermissionResourceType.ASSET, asset.getAreas(), areas);
        applyAsset(access, asset, request);
        asset.setAreas(areas);
        return mapper.toResponse(assetRepository.save(asset));
    }

    @DeleteMapping("/assets/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAsset(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Asset asset = assetOr404(uuid);
        require(access, PermissionResourceType.ASSET, PermissionAction.DELETE, asset.getAreas());
        asset.setDeleted(true);
        asset.setDeletedAt(OffsetDateTime.now());
        assetRepository.save(asset);
    }

    // ---- areas & access helpers ----

    /** Requested areas, or the default area when none were chosen. */
    private Set<Area> resolveAreas(Set<UUID> areaUuids) {
        Set<Area> areas = new HashSet<>();
        if (areaUuids != null) {
            areaUuids.forEach(areaUuid -> areas.add(areaRepository.findByUuid(areaUuid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Area not found"))));
        }
        if (areas.isEmpty()) {
            areas.add(areaRepository.findFirstByDefaultAreaTrue()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No default area configured")));
        }
        return areas;
    }

    /** Areas that are added or removed need edit rights in exactly those areas. */
    private void requireAreaChange(AccessContext access, PermissionResourceType type, Set<Area> before, Set<Area> after) {
        Set<Long> beforeIds = before.stream().map(Area::getId).collect(Collectors.toSet());
        Set<Long> afterIds = after.stream().map(Area::getId).collect(Collectors.toSet());
        Set<Area> changed = new HashSet<>();
        before.stream().filter(area -> !afterIds.contains(area.getId())).forEach(changed::add);
        after.stream().filter(area -> !beforeIds.contains(area.getId())).forEach(changed::add);
        require(access.canInAll(type, PermissionAction.EDIT, changed));
    }

    /** Hidden objects are reported as missing so their existence is not leaked. */
    private void requireVisible(boolean visible) {
        if (!visible) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found");
        }
    }

    private void applyLocation(AccessContext access, Location location, LocationRequest request) {
        location.setName(request.name());
        location.setDescription(request.description());
        location.setAddress(request.address());
        Location parent = request.parentLocationUuid() == null ? null : locationOr404(request.parentLocationUuid());
        if (parent != null && parent != location.getParentLocation()) {
            requireVisible(access.canViewLocation(parent));
        }
        for (Location current = parent; current != null; current = current.getParentLocation()) {
            if (current == location) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location cannot be its own parent");
            }
        }
        location.setParentLocation(parent);
        location.getImages().clear();
        if (request.images() != null) {
            request.images().stream().filter(InventoryController::hasSource)
                .forEach(imageRequest -> location.getImages().add(locationImage(location, imageRequest)));
        }
    }

    private void applyAssetType(AssetType type, AssetTypeRequest request) {
        type.setName(request.name());
        type.setDescription(request.description());
        type.setInspectionIntervalDays(request.inspectionIntervalDays());
        type.getFieldDefinitions().clear();
        if (request.fieldDefinitions() != null) {
            request.fieldDefinitions().forEach(fieldRequest -> type.getFieldDefinitions().add(fieldDefinition(type, fieldRequest)));
        }
        type.getImages().clear();
        if (request.images() != null) {
            request.images().stream().filter(InventoryController::hasSource)
                .forEach(imageRequest -> type.getImages().add(assetTypeImage(type, imageRequest)));
        }
        type.setTags(new HashSet<>());
        if (request.tagUuids() != null) {
            request.tagUuids().forEach(tagUuid -> type.getTags().add(tagOr404(tagUuid)));
        }
    }

    private void applyAsset(AccessContext access, Asset asset, AssetRequest request) {
        if (request.invId() != null && !request.invId().isBlank()) {
            asset.setInvId(request.invId());
        } else if (asset.getInvId() == null || asset.getInvId().isBlank()) {
            asset.setInvId(generateInvId());
        }
        asset.setName(request.name());
        asset.setDescription(request.description());
        asset.setSerialNumber(request.serialNumber());
        asset.setInventoryNumber(request.inventoryNumber());
        asset.setInspectionIntervalDays(request.inspectionIntervalDays());

        // newly referenced type / location must be visible to the user
        AssetType type = request.assetTypeUuid() == null ? null : assetTypeOr404(request.assetTypeUuid());
        if (type != null && type != asset.getAssetType()) {
            requireVisible(access.canViewAssetType(type));
        }
        asset.setAssetType(type);
        Location location = request.locationUuid() == null ? null : locationOr404(request.locationUuid());
        if (location != null && location != asset.getLocation()) {
            requireVisible(access.canViewLocation(location));
        }
        asset.setLocation(location);

        asset.setTags(new HashSet<>());
        if (request.tagUuids() != null) {
            request.tagUuids().forEach(tagUuid -> asset.getTags().add(tagOr404(tagUuid)));
        }
        asset.getFieldValues().clear();
        if (request.fieldValues() != null) {
            request.fieldValues().forEach(fieldRequest -> asset.getFieldValues().add(fieldValue(asset, fieldRequest)));
        }
        asset.getImages().clear();
        if (request.images() != null) {
            request.images().stream().filter(InventoryController::hasSource)
                .forEach(imageRequest -> asset.getImages().add(assetImage(asset, imageRequest)));
        }
    }

    private AssetFieldDefinition fieldDefinition(AssetType type, AssetFieldDefinitionRequest request) {
        return AssetFieldDefinition.builder()
            .assetType(type)
            .name(request.name())
            .fieldKey(resolveFieldKey(request.fieldKey(), request.name()))
            .fieldType(request.fieldType())
            .optionsJson(request.optionsJson())
            .required(request.required())
            .typeField(request.typeField())
            .sortOrder(request.sortOrder())
            .build();
    }

    private AssetFieldValue fieldValue(Asset asset, AssetFieldValueRequest request) {
        return AssetFieldValue.builder()
            .asset(asset)
            .fieldKey(resolveFieldKey(request.fieldKey(), request.name()))
            .name(request.name())
            .value(request.value())
            .customAssetField(request.customAssetField())
            .build();
    }

    private AssetImage assetImage(Asset asset, AssetImageRequest request) {
        StoredFile file = file(request.fileUuid());
        return AssetImage.builder()
            .asset(asset)
            .kind(request.kind())
            .file(file)
            .url(file == null ? request.url() : null)
            .fileName(request.fileName())
            .contentType(request.contentType())
            .sortOrder(request.sortOrder())
            .build();
    }

    private LocationImage locationImage(Location location, LocationImageRequest request) {
        StoredFile file = file(request.fileUuid());
        return LocationImage.builder()
            .location(location)
            .kind(request.kind())
            .file(file)
            .url(file == null ? request.url() : null)
            .fileName(request.fileName())
            .contentType(request.contentType())
            .sortOrder(request.sortOrder())
            .build();
    }

    private AssetTypeImage assetTypeImage(AssetType assetType, AssetImageRequest request) {
        StoredFile file = file(request.fileUuid());
        return AssetTypeImage.builder()
            .assetType(assetType)
            .kind(request.kind())
            .file(file)
            .url(file == null ? request.url() : null)
            .fileName(request.fileName())
            .contentType(request.contentType())
            .sortOrder(request.sortOrder())
            .build();
    }

    private StoredFile file(UUID uuid) {
        if (uuid == null) {
            return null;
        }
        return fileRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown file " + uuid));
    }

    /** An image needs an uploaded file or an external url. */
    private static boolean hasSource(AssetImageRequest request) {
        return request.fileUuid() != null || (request.url() != null && !request.url().isBlank());
    }

    private static boolean hasSource(LocationImageRequest request) {
        return request.fileUuid() != null || (request.url() != null && !request.url().isBlank());
    }

    private String generateInvId() {
        String invId;
        do {
            invId = "INV-" + java.time.LocalDate.now().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        } while (assetRepository.existsByInvId(invId));
        return invId;
    }

    private String resolveFieldKey(String fieldKey, String name) {
        if (fieldKey != null && !fieldKey.isBlank()) {
            return normalizeKey(fieldKey);
        }
        return normalizeKey(name);
    }

    private String normalizeKey(String value) {
        if (value == null || value.isBlank()) {
            return "field";
        }

        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replace("ß", "ss")
            .replaceAll("[^a-z0-9]+", "_")
            .replaceAll("^_+|_+$", "");

        return normalized.isBlank() ? "field" : normalized;
    }

    private Asset assetOr404(UUID uuid) {
        return assetRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset not found"));
    }

    private AssetType assetTypeOr404(UUID uuid) {
        return assetTypeRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset type not found"));
    }

    private Location locationOr404(UUID uuid) {
        return locationRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location not found"));
    }

    private Tag tagOr404(UUID uuid) {
        return tagRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tag not found"));
    }
}
