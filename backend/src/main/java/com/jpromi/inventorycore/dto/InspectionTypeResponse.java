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
    List<UUID> areaUuids,
    List<String> areaNames,
    /** The current user may start and do inspections of this kind (has the right to inspect in its areas). */
    boolean usable,
    /** The current user may change / delete it (rights for types in its areas). */
    boolean editable,
    boolean deletable,
    List<InspectionFieldResponse> fields,
    long inspectionCount
) {}
