package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionMode;
import com.jpromi.inventorycore.enums.IntervalUnit;

/** {@code intervalValue}/{@code intervalUnit} null = not recurring; {@code assetTypeUuids} empty = all assets. */
public record InspectionTypeRequest(
    String name,
    String description,
    String color,
    InspectionMode mode,
    Integer intervalValue,
    IntervalUnit intervalUnit,
    List<UUID> assetTypeUuids,
    List<InspectionFieldRequest> fields
) {}
