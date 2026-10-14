package com.jpromi.inventorycore.dto;

import java.util.List;

public record AssetTypeRequest(
    String name,
    String description,
    Integer inspectionIntervalDays,
    List<AssetFieldDefinitionRequest> fieldDefinitions,
    List<AssetImageRequest> images
) {}
