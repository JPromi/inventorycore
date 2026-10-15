package com.jpromi.inventorycore.dto;

import java.util.UUID;

/** A tag with how many assets / types (visible to the user) carry it. */
public record TagUsageResponse(
    UUID uuid,
    String name,
    String color,
    long assetCount,
    long assetTypeCount
) {}
