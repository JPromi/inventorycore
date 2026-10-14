package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.AssetFieldType;

public record AssetFieldDefinitionResponse(
    UUID uuid,
    String name,
    String fieldKey,
    AssetFieldType fieldType,
    String optionsJson,
    boolean required,
    boolean typeField,
    int sortOrder
) {}
