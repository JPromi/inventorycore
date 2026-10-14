package com.jpromi.inventorycore.dto;

import com.jpromi.inventorycore.enums.AssetFieldType;

public record AssetFieldDefinitionRequest(
    String name,
    String fieldKey,
    AssetFieldType fieldType,
    String optionsJson,
    boolean required,
    boolean typeField,
    int sortOrder
) {}
