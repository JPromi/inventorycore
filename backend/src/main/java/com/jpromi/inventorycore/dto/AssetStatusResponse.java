package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.AssetStatusCategory;
import com.jpromi.inventorycore.enums.AssetStatusKey;

/** {@code systemKey} is set for the built-in statuses (the UI shows its own text for them). */
public record AssetStatusResponse(
    UUID uuid,
    AssetStatusKey systemKey,
    String name,
    String color,
    AssetStatusCategory category,
    UUID areaUuid,
    boolean deleted
) {}
