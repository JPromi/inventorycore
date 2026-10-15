package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.UUID;

/** Which assets an inspection expects. Every given criterion must match; within one list any entry matches. */
public record InspectionFilter(
    UUID locationUuid,
    boolean includeSubLocations,
    List<UUID> tagUuids,
    List<UUID> assetTypeUuids,
    List<UUID> areaUuids,
    List<UUID> locationUuids
) {
    public InspectionFilter(UUID locationUuid, boolean includeSubLocations, List<UUID> tagUuids,
        List<UUID> assetTypeUuids, List<UUID> areaUuids) {
        this(locationUuid, includeSubLocations, tagUuids, assetTypeUuids, areaUuids, List.of());
    }
}
