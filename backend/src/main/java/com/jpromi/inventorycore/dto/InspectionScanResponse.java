package com.jpromi.inventorycore.dto;

/**
 * CHECKED = expected asset marked as present, ALREADY_CHECKED = it was checked before,
 * UNEXPECTED = asset that does not belong to this inspection (added with a warning),
 * UNKNOWN = code matches no asset (added with a warning), IGNORED = e.g. a location label.
 */
public record InspectionScanResponse(
    String outcome,
    String message,
    InspectionItemResponse item
) {}
