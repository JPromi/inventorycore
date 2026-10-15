package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionCheckMethod;
import com.jpromi.inventorycore.enums.InspectionCondition;
import com.jpromi.inventorycore.enums.InspectionItemStatus;

/** {@code locationName} is where the asset belongs (for unexpected items: its actual home). */
public record InspectionItemResponse(
    UUID uuid,
    UUID assetUuid,
    String assetName,
    String invId,
    String serialNumber,
    UUID assetTypeUuid,
    String assetTypeName,
    String locationName,
    boolean expected,
    InspectionItemStatus status,
    InspectionCheckMethod method,
    InspectionCondition condition,
    String scannedCode,
    OffsetDateTime checkedAt,
    String checkedByName,
    String note,
    List<InspectionItemValueResponse> values,
    List<InspectionPhotoResponse> photos,
    UUID parentAssetUuid,
    String parentAssetNote,
    com.jpromi.inventorycore.enums.AssetInspectionPolicy inspectionPolicy
) {}
