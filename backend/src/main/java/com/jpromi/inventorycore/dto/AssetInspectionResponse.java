package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionCheckMethod;
import com.jpromi.inventorycore.enums.InspectionItemStatus;
import com.jpromi.inventorycore.enums.InspectionStatus;

/** One inspection an asset appeared in, with the result for this asset. */
public record AssetInspectionResponse(
    UUID inspectionUuid,
    String title,
    String typeName,
    InspectionStatus inspectionStatus,
    OffsetDateTime createdAt,
    OffsetDateTime completedAt,
    boolean expected,
    InspectionItemStatus status,
    InspectionCheckMethod method,
    OffsetDateTime checkedAt,
    String checkedByName,
    String locationName,
    String note,
    List<InspectionItemValueResponse> values
) {}
