package com.jpromi.inventorycore.dto;

import java.util.UUID;

/**
 * {@code onlyDue}: only assets whose recurring inspection of this type is overdue or due within
 * {@code dueWithinDays} days (default 7).
 */
public record InspectionCreateRequest(
    UUID inspectionTypeUuid,
    String title,
    InspectionFilter filter,
    Boolean onlyDue,
    Integer dueWithinDays
) {}
