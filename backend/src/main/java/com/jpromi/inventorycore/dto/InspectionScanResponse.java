package com.jpromi.inventorycore.dto;

import java.util.List;

/**
 * CHECKED = expected asset marked as present, ALREADY_CHECKED = it was checked before,
 * UNEXPECTED = asset that does not belong to this inspection (added with a warning),
 * UNKNOWN = code matches no asset (added with a warning), IGNORED = e.g. a location label,
 * AMBIGUOUS = the code matches several assets (e.g. the same serial number); nothing is recorded,
 * the user picks one of {@code candidates} and scans again with its uuid.
 */
public record InspectionScanResponse(
    String outcome,
    String message,
    InspectionItemResponse item,
    List<InspectionScanCandidate> candidates
) {
    public InspectionScanResponse(String outcome, String message, InspectionItemResponse item) {
        this(outcome, message, item, List.of());
    }
}
