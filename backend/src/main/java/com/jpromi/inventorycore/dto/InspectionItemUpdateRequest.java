package com.jpromi.inventorycore.dto;

import java.util.Map;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionItemStatus;

/**
 * Fields that are null stay unchanged; {@code values} maps field uuid to value (empty string clears).
 * {@code condition}: OK / DEFECT for the function check (also marks the asset as present), empty string clears.
 */
public record InspectionItemUpdateRequest(
    InspectionItemStatus status,
    String note,
    String condition,
    Map<UUID, String> values
) {}
