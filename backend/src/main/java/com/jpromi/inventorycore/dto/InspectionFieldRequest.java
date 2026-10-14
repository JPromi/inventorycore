package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.AssetFieldType;

/** {@code uuid} of an existing field to keep its values; null for a new field. {@code assetTypeUuid} null = all assets. */
public record InspectionFieldRequest(
    UUID uuid,
    UUID assetTypeUuid,
    String name,
    AssetFieldType fieldType,
    String optionsJson,
    boolean required,
    int sortOrder
) {}
