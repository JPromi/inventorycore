package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record AssetRequest(
    String invId,
    String name,
    String description,
    String serialNumber,
    String inventoryNumber,
    Integer inspectionIntervalDays,
    UUID assetTypeUuid,
    UUID locationUuid,
    Set<UUID> tagUuids,
    List<AssetFieldValueRequest> fieldValues,
    List<AssetImageRequest> images,
    Set<UUID> areaUuids,
    UUID parentAssetUuid,
    String parentAssetNote
) {}
