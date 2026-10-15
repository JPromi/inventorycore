package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionMode;
import com.jpromi.inventorycore.enums.IntervalUnit;

/**
 * {@code intervalValue}/{@code intervalUnit} null = not recurring; {@code assetTypeUuids} empty = all assets;
 * {@code areaUuids} empty = all areas.
 */
public record InspectionTypeRequest(
    String name,
    String description,
    String color,
    InspectionMode mode,
    Integer intervalValue,
    IntervalUnit intervalUnit,
    /** inventory only: also check whether assets work */
    Boolean checkFunction,
    List<UUID> assetTypeUuids,
    List<UUID> areaUuids,
    List<InspectionFieldRequest> fields,
    List<UUID> defaultTagUuids,
    boolean includeChildAssets,
    List<UUID> defaultAssetTypeUuids,
    List<UUID> defaultLocationUuids,
    List<UUID> recurringTagUuids,
    UUID protocolAreaUuid
) {}
