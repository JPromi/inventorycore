package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionMode;
import com.jpromi.inventorycore.enums.IntervalUnit;

public record InspectionTypeResponse(
    UUID uuid,
    String name,
    String description,
    String color,
    InspectionMode mode,
    Integer intervalValue,
    IntervalUnit intervalUnit,
    List<UUID> assetTypeUuids,
    List<String> assetTypeNames,
    List<InspectionFieldResponse> fields,
    long inspectionCount
) {}
