package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record AssetFieldValueResponse(
    UUID uuid,
    UUID fieldDefinitionUuid,
    String fieldKey,
    String name,
    String value,
    boolean customAssetField
) {}
