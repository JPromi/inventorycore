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
    Integer dueWithinDays,
    /** inventory: function check for this run; null = default of the type */
    Boolean checkFunction,
    /** Null uses the template default; independent of location descendants. */
    Boolean includeChildAssets,
    UUID areaUuid
) {
    public InspectionCreateRequest(UUID inspectionTypeUuid, String title, InspectionFilter filter,
        Boolean onlyDue, Integer dueWithinDays, Boolean checkFunction, Boolean includeChildAssets) {
        this(inspectionTypeUuid, title, filter, onlyDue, dueWithinDays, checkFunction, includeChildAssets, null);
    }
}
