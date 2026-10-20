package com.jpromi.inventorycore.service;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.dto.DashboardResponse;
import com.jpromi.inventorycore.dto.DashboardResponse.CountEntry;
import com.jpromi.inventorycore.dto.DashboardResponse.DueCounts;
import com.jpromi.inventorycore.dto.DashboardResponse.ResultCounts;
import com.jpromi.inventorycore.dto.InspectionDueResponse;
import com.jpromi.inventorycore.dto.InspectionSummaryResponse;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.enums.InspectionStatus;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

/**
 * Numbers and short lists for the dashboard. Uses the same rules as the list pages: permission
 * filter first, then the sidebar area selection (assets and locations also through their location /
 * parent locations, types only through their own areas, inspections through the protocol area,
 * due dates through their asset).
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {
    static final int NEXT_DUE_LIMIT = 5;
    static final int RECENT_LIMIT = 4;
    static final int TAG_LIMIT = 6;
    static final int TYPE_LIMIT = 5;

    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final InspectionService inspectionService;
    private final InspectionScheduleService scheduleService;

    public DashboardService(
        AssetRepository assetRepository,
        LocationRepository locationRepository,
        AssetTypeRepository assetTypeRepository,
        InspectionService inspectionService,
        InspectionScheduleService scheduleService
    ) {
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.inspectionService = inspectionService;
        this.scheduleService = scheduleService;
    }

    public DashboardResponse dashboard(AccessContext access, List<UUID> areas) {
        Set<UUID> selection = Paging.selection(areas);
        List<Asset> assets = assetRepository.findByDeletedFalse().stream()
            .filter(access::canViewAsset)
            .filter(asset -> Paging.inAreas(asset, selection))
            .toList();
        long locationCount = locationRepository.findByDeletedFalse().stream()
            .filter(access::canViewLocation)
            .filter(location -> Paging.inAreas(location, selection))
            .count();
        long assetTypeCount = assetTypeRepository.findByDeletedFalse().stream()
            .filter(access::canViewAssetType)
            .filter(type -> selection.isEmpty() || Paging.overlaps(type.getAreas(), selection))
            .count();

        List<CountEntry> tags = tagCounts(assets);
        List<CountEntry> types = typeCounts(assets);
        List<CountEntry> topTypes = types.stream().limit(TYPE_LIMIT).toList();
        long otherTypes = types.stream().skip(TYPE_LIMIT).mapToLong(CountEntry::count).sum();

        boolean canInspect = access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.INSPECT);
        if (!canInspect) {
            return new DashboardResponse(assets.size(), locationCount, assetTypeCount, tags.size(), false,
                new DueCounts(0, 0, 0), List.of(), 0, 0, List.of(), new ResultCounts(0, 0, 0, 0),
                tags.stream().limit(TAG_LIMIT).toList(), topTypes, otherTypes);
        }

        Set<UUID> assetUuids = assets.stream().map(Asset::getUuid).collect(Collectors.toSet());
        List<InspectionDueResponse> due = scheduleService.all(access).stream()
            .filter(entry -> assetUuids.contains(entry.assetUuid()))
            .sorted(Comparator.comparingLong(InspectionDueResponse::daysUntilDue)
                .thenComparing(InspectionDueResponse::assetName, String.CASE_INSENSITIVE_ORDER))
            .toList();
        DueCounts dueCounts = new DueCounts(
            due.stream().filter(entry -> "OVERDUE".equals(entry.state())).count(),
            due.stream().filter(entry -> "DUE".equals(entry.state())).count(),
            due.stream().filter(entry -> "OK".equals(entry.state())).count());

        List<InspectionSummaryResponse> inspections = inspectionService.inspections(access).stream()
            .filter(inspection -> Paging.overlapsUuids(inspection.areaUuids(), selection))
            .toList();
        List<InspectionSummaryResponse> completed = inspections.stream()
            .filter(inspection -> inspection.status() == InspectionStatus.COMPLETED && inspection.completedAt() != null)
            .sorted(Comparator.comparing(InspectionSummaryResponse::completedAt).reversed())
            .toList();
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime recentSince = now.minusDays(DashboardResponse.RECENT_DAYS);
        OffsetDateTime resultsSince = now.minusDays(DashboardResponse.RESULT_DAYS);

        return new DashboardResponse(
            assets.size(),
            locationCount,
            assetTypeCount,
            tags.size(),
            true,
            dueCounts,
            due.stream().limit(NEXT_DUE_LIMIT).toList(),
            inspections.stream().filter(inspection -> inspection.status() == InspectionStatus.OPEN).count(),
            completed.stream().filter(inspection -> inspection.completedAt().isAfter(recentSince)).count(),
            completed.stream().limit(RECENT_LIMIT).toList(),
            results(completed.stream().filter(inspection -> inspection.completedAt().isAfter(resultsSince)).toList()),
            tags.stream().limit(TAG_LIMIT).toList(),
            topTypes,
            otherTypes);
    }

    static ResultCounts results(List<InspectionSummaryResponse> inspections) {
        long ok = 0, defect = 0, missing = 0, failed = 0;
        for (InspectionSummaryResponse inspection : inspections) {
            var counts = inspection.counts();
            ok += counts.present() - counts.defect() + counts.passed();
            defect += counts.defect();
            missing += counts.missing();
            failed += counts.failed();
        }
        return new ResultCounts(ok, defect, missing, failed);
    }

    /** Assets per tag (own and inherited from the type, each tag once per asset), most used first. */
    static List<CountEntry> tagCounts(List<Asset> assets) {
        Map<UUID, Tag> tags = new HashMap<>();
        Map<UUID, Long> counts = new HashMap<>();
        for (Asset asset : assets) {
            Stream<Tag> typeTags = asset.getAssetType() == null ? Stream.empty() : asset.getAssetType().getTags().stream();
            Stream.concat(asset.getTags().stream(), typeTags)
                .collect(Collectors.toMap(Tag::getUuid, tag -> tag, (first, second) -> first, LinkedHashMap::new))
                .values()
                .forEach(tag -> {
                    tags.putIfAbsent(tag.getUuid(), tag);
                    counts.merge(tag.getUuid(), 1L, Long::sum);
                });
        }
        return counts.entrySet().stream()
            .map(entry -> {
                Tag tag = tags.get(entry.getKey());
                return new CountEntry(tag.getUuid(), tag.getName(), tag.getColor(), entry.getValue());
            })
            .sorted(byCountThenName())
            .toList();
    }

    /** Assets per type, most used first; assets without type form one entry without uuid and name. */
    static List<CountEntry> typeCounts(List<Asset> assets) {
        Map<UUID, AssetType> types = new HashMap<>();
        Map<UUID, Long> counts = new HashMap<>();
        long withoutType = 0;
        for (Asset asset : assets) {
            AssetType type = asset.getAssetType();
            if (type == null || type.isDeleted()) {
                withoutType++;
                continue;
            }
            types.putIfAbsent(type.getUuid(), type);
            counts.merge(type.getUuid(), 1L, Long::sum);
        }
        List<CountEntry> entries = new java.util.ArrayList<>(counts.entrySet().stream()
            .map(entry -> new CountEntry(entry.getKey(), types.get(entry.getKey()).getName(), null, entry.getValue()))
            .toList());
        if (withoutType > 0) {
            entries.add(new CountEntry(null, null, null, withoutType));
        }
        entries.sort(byCountThenName());
        return entries;
    }

    private static Comparator<CountEntry> byCountThenName() {
        return Comparator.comparingLong(CountEntry::count).reversed()
            .thenComparing(CountEntry::name, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER));
    }
}
