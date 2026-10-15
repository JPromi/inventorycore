package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.AssetFieldType;

public record InspectionItemValueResponse(
    UUID fieldUuid,
    String fieldName,
    AssetFieldType fieldType,
    String value
) {}
