package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record AssetTypeResponse(
    UUID uuid,
    String name,
    String description,
    Integer inspectionIntervalDays,
    OffsetDateTime createdAt,
    OffsetDateTime deletedAt,
    boolean deleted,
    List<AssetFieldDefinitionResponse> fieldDefinitions,
    List<AssetImageResponse> images
) {}
