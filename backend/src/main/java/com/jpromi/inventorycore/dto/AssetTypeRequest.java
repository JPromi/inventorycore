package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record AssetTypeRequest(
    String name,
    String description,
    Integer inspectionIntervalDays,
    List<AssetFieldDefinitionRequest> fieldDefinitions,
    List<AssetImageRequest> images,
    Set<UUID> tagUuids,
    Set<UUID> areaUuids
) {}
