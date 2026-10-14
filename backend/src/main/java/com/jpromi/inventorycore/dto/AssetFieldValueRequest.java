package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record AssetFieldValueRequest(
    UUID fieldDefinitionUuid,
    String fieldKey,
    String name,
    String value,
    boolean customAssetField
) {}
