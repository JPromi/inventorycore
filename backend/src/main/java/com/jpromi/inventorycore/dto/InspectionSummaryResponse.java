package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionMode;
import com.jpromi.inventorycore.enums.InspectionStatus;

public record InspectionSummaryResponse(
    UUID uuid,
    String title,
    UUID inspectionTypeUuid,
    String typeName,
    /** Areas of the inspection type (empty = all). */
    List<UUID> areaUuids,
    List<String> areaNames,
    InspectionStatus status,
    InspectionMode mode,
    boolean checkFunction,
    String filterSummary,
    OffsetDateTime createdAt,
    String createdByName,
    OffsetDateTime completedAt,
    String completedByName,
    InspectionCounts counts
) {}
