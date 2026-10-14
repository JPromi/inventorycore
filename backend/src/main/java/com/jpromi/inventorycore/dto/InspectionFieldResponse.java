package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.AssetFieldType;

public record InspectionFieldResponse(
    UUID uuid,
    UUID assetTypeUuid,
    String assetTypeName,
    String name,
    AssetFieldType fieldType,
    String optionsJson,
    boolean required,
    int sortOrder
) {}
