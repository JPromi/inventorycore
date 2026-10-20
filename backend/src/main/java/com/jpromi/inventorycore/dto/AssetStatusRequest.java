package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.AssetStatusCategory;

public record AssetStatusRequest(
    String name,
    String color,
    AssetStatusCategory category,
    UUID areaUuid
) {}
