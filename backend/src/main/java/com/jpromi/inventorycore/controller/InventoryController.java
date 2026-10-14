package com.jpromi.inventorycore.controller;

import java.time.OffsetDateTime;
import java.text.Normalizer;
import java.util.Locale;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
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
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetFieldDefinition;
import com.jpromi.inventorycore.entity.AssetFieldValue;
import com.jpromi.inventorycore.entity.AssetImage;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.AssetTypeImage;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.LocationImage;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.TagRepository;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.PermissionService;

@RestController
@RequestMapping("/api")
public class InventoryController {

    private final AssetRepository assetRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LocationRepository locationRepository;
    private final TagRepository tagRepository;
    private final PermissionService permissionService;
    private final ApiMapper mapper;

    public InventoryController(
        AssetRepository assetRepository,
        AssetTypeRepository assetTypeRepository,
        LocationRepository locationRepository,
        TagRepository tagRepository,
        PermissionService permissionService,
        ApiMapper mapper
    ) {
        this.assetRepository = assetRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.locationRepository = locationRepository;
        this.tagRepository = tagRepository;
        this.permissionService = permissionService;
        this.mapper = mapper;
    }

    @GetMapping("/locations")
    public List<LocationResponse> locations(Authentication authentication) {
        permissionService.requireView(authentication, PermissionResourceType.LOCATION, null);
        return locationRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @GetMapping("/locations/{uuid}")
    public LocationResponse location(@PathVariable UUID uuid, Authentication authentication) {
        permissionService.requireView(authentication, PermissionResourceType.LOCATION, uuid);
        return mapper.toResponse(locationOr404(uuid));
    }

    @PostMapping("/locations")
    @ResponseStatus(HttpStatus.CREATED)
    public LocationResponse createLocation(@RequestBody LocationRequest request, Authentication authentication) {
        permissionService.requireCreate(authentication, PermissionResourceType.LOCATION);
        Location location = Location.builder().build();
        applyLocation(location, request);
        return mapper.toResponse(locationRepository.save(location));
    }

    @PatchMapping("/locations/{uuid}")
    public LocationResponse updateLocation(@PathVariable UUID uuid, @RequestBody LocationRequest request, Authentication authentication) {
        permissionService.requireEdit(authentication, PermissionResourceType.LOCATION, uuid);
        Location location = locationOr404(uuid);
        applyLocation(location, request);
        return mapper.toResponse(locationRepository.save(location));
    }

    @DeleteMapping("/locations/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLocation(@PathVariable UUID uuid, Authentication authentication) {
        permissionService.requireDelete(authentication, PermissionResourceType.LOCATION, uuid);
        Location location = locationOr404(uuid);
        location.setDeleted(true);
        location.setDeletedAt(OffsetDateTime.now());
        locationRepository.save(location);
    }

    @GetMapping("/asset-types")
    public List<AssetTypeResponse> assetTypes(Authentication authentication) {
        permissionService.requireView(authentication, PermissionResourceType.CATEGORY, null);
        return assetTypeRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @GetMapping("/asset-types/{uuid}")
    public AssetTypeResponse assetType(@PathVariable UUID uuid, Authentication authentication) {
        permissionService.requireView(authentication, PermissionResourceType.CATEGORY, uuid);
        return mapper.toResponse(assetTypeOr404(uuid));
    }

    @PostMapping("/asset-types")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetTypeResponse createAssetType(@RequestBody AssetTypeRequest request, Authentication authentication) {
        permissionService.requireCreate(authentication, PermissionResourceType.CATEGORY);
        AssetType type = AssetType.builder().build();
        applyAssetType(type, request);
        return mapper.toResponse(assetTypeRepository.save(type));
    }

    @PatchMapping("/asset-types/{uuid}")
    public AssetTypeResponse updateAssetType(@PathVariable UUID uuid, @RequestBody AssetTypeRequest request, Authentication authentication) {
        permissionService.requireEdit(authentication, PermissionResourceType.CATEGORY, uuid);
        AssetType type = assetTypeOr404(uuid);
        applyAssetType(type, request);
        return mapper.toResponse(assetTypeRepository.save(type));
    }

    @DeleteMapping("/asset-types/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAssetType(@PathVariable UUID uuid, Authentication authentication) {
        permissionService.requireDelete(authentication, PermissionResourceType.CATEGORY, uuid);
        AssetType type = assetTypeOr404(uuid);
        type.setDeleted(true);
        type.setDeletedAt(OffsetDateTime.now());
        assetTypeRepository.save(type);
    }

    @GetMapping("/tags")
    public List<TagResponse> tags(Authentication authentication) {
        permissionService.requireView(authentication, PermissionResourceType.CATEGORY, null);
        return tagRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @PostMapping("/tags")
    @ResponseStatus(HttpStatus.CREATED)
    public TagResponse createTag(@RequestBody TagRequest request, Authentication authentication) {
        permissionService.requireCreate(authentication, PermissionResourceType.CATEGORY);
        Tag tag = Tag.builder().name(request.name()).color(request.color()).build();
        return mapper.toResponse(tagRepository.save(tag));
    }

    @PatchMapping("/tags/{uuid}")
    public TagResponse updateTag(@PathVariable UUID uuid, @RequestBody TagRequest request, Authentication authentication) {
        permissionService.requireEdit(authentication, PermissionResourceType.CATEGORY, uuid);
        Tag tag = tagOr404(uuid);
        tag.setName(request.name());
        tag.setColor(request.color());
        return mapper.toResponse(tagRepository.save(tag));
    }

    @DeleteMapping("/tags/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTag(@PathVariable UUID uuid, Authentication authentication) {
        permissionService.requireDelete(authentication, PermissionResourceType.CATEGORY, uuid);
        tagRepository.delete(tagOr404(uuid));
    }

    @GetMapping("/assets")
    public List<AssetResponse> assets(Authentication authentication) {
        permissionService.requireView(authentication, PermissionResourceType.ASSET, null);
        return assetRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @GetMapping("/assets/{uuid}")
    public AssetResponse asset(@PathVariable UUID uuid, Authentication authentication) {
        permissionService.requireView(authentication, PermissionResourceType.ASSET, uuid);
        return mapper.toResponse(assetOr404(uuid));
    }

    @PostMapping("/assets")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetResponse createAsset(@RequestBody AssetRequest request, Authentication authentication) {
        permissionService.requireCreate(authentication, PermissionResourceType.ASSET);
        Asset asset = Asset.builder().build();
        applyAsset(asset, request);
        return mapper.toResponse(assetRepository.save(asset));
    }

    @PatchMapping("/assets/{uuid}")
    public AssetResponse updateAsset(@PathVariable UUID uuid, @RequestBody AssetRequest request, Authentication authentication) {
        permissionService.requireEdit(authentication, PermissionResourceType.ASSET, uuid);
        Asset asset = assetOr404(uuid);
        applyAsset(asset, request);
        return mapper.toResponse(assetRepository.save(asset));
    }

    @DeleteMapping("/assets/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAsset(@PathVariable UUID uuid, Authentication authentication) {
        permissionService.requireDelete(authentication, PermissionResourceType.ASSET, uuid);
        Asset asset = assetOr404(uuid);
        asset.setDeleted(true);
        asset.setDeletedAt(OffsetDateTime.now());
        assetRepository.save(asset);
    }

    private void applyLocation(Location location, LocationRequest request) {
        location.setName(request.name());
        location.setDescription(request.description());
        location.setAddress(request.address());
        location.setParentLocation(request.parentLocationUuid() == null ? null : locationOr404(request.parentLocationUuid()));
        location.getImages().clear();
        if (request.images() != null) {
            request.images().forEach(imageRequest -> location.getImages().add(locationImage(location, imageRequest)));
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
            request.images().forEach(imageRequest -> type.getImages().add(assetTypeImage(type, imageRequest)));
        }
    }

    private void applyAsset(Asset asset, AssetRequest request) {
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
        asset.setAssetType(request.assetTypeUuid() == null ? null : assetTypeOr404(request.assetTypeUuid()));
        asset.setLocation(request.locationUuid() == null ? null : locationOr404(request.locationUuid()));
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
            request.images().forEach(imageRequest -> asset.getImages().add(assetImage(asset, imageRequest)));
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
        return AssetImage.builder()
            .asset(asset)
            .kind(request.kind())
            .url(request.url())
            .fileName(request.fileName())
            .contentType(request.contentType())
            .sortOrder(request.sortOrder())
            .build();
    }

    private LocationImage locationImage(Location location, LocationImageRequest request) {
        return LocationImage.builder()
            .location(location)
            .kind(request.kind())
            .url(request.url())
            .fileName(request.fileName())
            .contentType(request.contentType())
            .sortOrder(request.sortOrder())
            .build();
    }

    private AssetTypeImage assetTypeImage(AssetType assetType, AssetImageRequest request) {
        return AssetTypeImage.builder()
            .assetType(assetType)
            .kind(request.kind())
            .url(request.url())
            .fileName(request.fileName())
            .contentType(request.contentType())
            .sortOrder(request.sortOrder())
            .build();
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
