package com.jpromi.inventorycore.service;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;

import com.jpromi.inventorycore.dto.AssetResponse;
import com.jpromi.inventorycore.dto.AssetTypeResponse;
import com.jpromi.inventorycore.dto.LocationResponse;
import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.dto.TagUsageResponse;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.enums.LocationType;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.TagRepository;

/**
 * Searched and paged inventory lists for the list pages. The plain list endpoints stay for
 * pickers that need everything (location tree, parent asset, ...). `areas` is the sidebar
 * selection, `area` the area filter of the page; both use the same rule as before in the UI
 * (assets and locations also count through their location / parent).
 */
@Service
@Transactional(readOnly = true)
public class InventoryListService {
    private static final Comparator<String> BY_NAME = Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER);

    private final AssetRepository assetRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LocationRepository locationRepository;
    private final TagRepository tagRepository;
    private final PermissionService permissionService;
    private final ApiMapper mapper;

    public InventoryListService(
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

    public PageResponse<AssetResponse> assets(
        String q,
        UUID tag,
        UUID location,
        UUID assetType,
        UUID area,
        List<UUID> areas,
        int page,
        int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        List<String> terms = Paging.terms(q);
        Set<UUID> selection = Paging.selection(areas);
        Set<UUID> areaFilter = area == null ? Set.of() : Set.of(area);
        List<Asset> matches = assetRepository.findByDeletedFalse().stream()
            .filter(access::canViewAsset)
            .filter(asset -> Paging.inAreas(asset, selection) && Paging.inAreas(asset, areaFilter))
            .filter(asset -> assetType == null || (asset.getAssetType() != null && asset.getAssetType().getUuid().equals(assetType)))
            .filter(asset -> location == null || (asset.getLocation() != null && Paging.within(asset.getLocation(), location)))
            .filter(asset -> tag == null || tagsOf(asset).anyMatch(entry -> entry.getUuid().equals(tag)))
            .filter(asset -> Paging.matches(terms, Stream.concat(
                Stream.of(asset.getName(), asset.getDescription(), asset.getInvId(), asset.getSerialNumber(), asset.getInventoryNumber()),
                tagsOf(asset).map(Tag::getName)).toList()))
            .sorted(Comparator.comparing(Asset::getName, BY_NAME))
            .toList();
        return Paging.page(matches, page, size, mapper::toResponse);
    }

    public PageResponse<LocationResponse> locations(
        String q,
        LocationType type,
        UUID area,
        List<UUID> areas,
        int page,
        int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        List<String> terms = Paging.terms(q);
        Set<UUID> selection = Paging.selection(areas);
        Set<UUID> areaFilter = area == null ? Set.of() : Set.of(area);
        List<Location> matches = locationRepository.findByDeletedFalse().stream()
            .filter(access::canViewLocation)
            .filter(location -> Paging.inAreas(location, selection) && Paging.inAreas(location, areaFilter))
            .filter(location -> type == null || location.getLocationType() == type)
            .filter(location -> Paging.matches(terms, location.getName(), location.getAddress(), location.getDescription()))
            .sorted(Comparator.comparing(Location::getName, BY_NAME))
            .toList();
        return Paging.page(matches, page, size, mapper::toResponse);
    }

    public PageResponse<AssetTypeResponse> assetTypes(
        String q,
        UUID area,
        List<UUID> areas,
        int page,
        int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        List<String> terms = Paging.terms(q);
        Set<UUID> selection = Paging.selection(areas);
        List<AssetType> matches = assetTypeRepository.findByDeletedFalse().stream()
            .filter(access::canViewAssetType)
            // types without areas are not part of any area selection (same as before in the list)
            .filter(type -> selection.isEmpty() || type.getAreas().stream().anyMatch(entry -> selection.contains(entry.getUuid())))
            .filter(type -> area == null || type.getAreas().stream().anyMatch(entry -> entry.getUuid().equals(area)))
            .filter(type -> Paging.matches(terms, Stream.concat(
                Stream.of(type.getName(), type.getDescription()), type.getTags().stream().map(Tag::getName)).toList()))
            .sorted(Comparator.comparing(AssetType::getName, BY_NAME))
            .toList();
        return Paging.page(matches, page, size, mapper::toResponse);
    }

    /** Tags are global; the usage counts only include assets and types the user may see. */
    public PageResponse<TagUsageResponse> tags(
        String q,
        int page,
        int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        List<String> terms = Paging.terms(q);
        List<Tag> matches = tagRepository.findAll().stream()
            .filter(tag -> Paging.matches(terms, tag.getName()))
            .sorted(Comparator.comparing(Tag::getName, BY_NAME))
            .toList();
        PageResponse<Tag> selected = Paging.page(matches, page, size, tag -> tag);
        if (selected.items().isEmpty()) {
            return new PageResponse<>(List.of(), selected.total(), selected.page(), selected.size(), selected.hasMore());
        }
        Map<UUID, Long> assetCounts = new HashMap<>();
        assetRepository.findByDeletedFalse().stream().filter(access::canViewAsset)
            .forEach(asset -> asset.getTags().forEach(tag -> assetCounts.merge(tag.getUuid(), 1L, Long::sum)));
        Map<UUID, Long> typeCounts = new HashMap<>();
        assetTypeRepository.findByDeletedFalse().stream().filter(access::canViewAssetType)
            .forEach(type -> type.getTags().forEach(tag -> typeCounts.merge(tag.getUuid(), 1L, Long::sum)));
        List<TagUsageResponse> items = selected.items().stream()
            .map(tag -> new TagUsageResponse(tag.getUuid(), tag.getName(), tag.getColor(),
                assetCounts.getOrDefault(tag.getUuid(), 0L), typeCounts.getOrDefault(tag.getUuid(), 0L)))
            .toList();
        return new PageResponse<>(items, selected.total(), selected.page(), selected.size(), selected.hasMore());
    }

    /** Own tags plus the tags of the asset's type (shown and searched together in the list). */
    private static Stream<Tag> tagsOf(Asset asset) {
        Stream<Tag> typeTags = asset.getAssetType() == null ? Stream.empty() : asset.getAssetType().getTags().stream();
        return Stream.concat(asset.getTags().stream(), typeTags);
    }
}
