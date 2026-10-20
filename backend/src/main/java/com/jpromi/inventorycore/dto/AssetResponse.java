package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public record AssetResponse(
    UUID uuid,
    String invId,
    String name,
    String description,
    String serialNumber,
    String inventoryNumber,
    Integer inspectionIntervalDays,
    UUID assetTypeUuid,
    UUID locationUuid,
    Set<TagResponse> tags,
    List<AssetFieldValueResponse> fieldValues,
    List<AssetImageResponse> images,
    OffsetDateTime createdAt,
    OffsetDateTime deletedAt,
    boolean deleted,
    Set<UUID> areaUuids,
    UUID parentAssetUuid,
    String parentAssetNote,
    com.jpromi.inventorycore.enums.AssetInspectionPolicy inspectionPolicy,
    AssetStatusResponse status,
    OffsetDateTime statusChangedAt
) {}
