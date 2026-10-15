package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record AreaResponse(
    UUID uuid,
    String name,
    String description,
    String color,
    boolean defaultArea,
    Long assetCount,
    Long locationCount,
    Long assetTypeCount
) {}
