package com.jpromi.inventorycore.enums;

/**
 * PENDING = not checked yet.
 * Inventory: PRESENT = found, MISSING = not there.
 * Single checks: PASSED = in order, FAILED = defect found.
 */
public enum InspectionItemStatus {
    PENDING,
    PRESENT,
    MISSING,
    PASSED,
    FAILED
}
