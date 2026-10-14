package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionStatus;

public record InspectionSummaryResponse(
    UUID uuid,
    String title,
    UUID inspectionTypeUuid,
    String typeName,
    InspectionStatus status,
    String filterSummary,
    OffsetDateTime createdAt,
    String createdByName,
    OffsetDateTime completedAt,
    String completedByName,
    InspectionCounts counts
) {}
