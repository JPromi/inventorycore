package com.jpromi.inventorycore.enums;

/**
 * INVENTORY: the expected assets are fixed by filters and marked present/missing; other assets
 * found are foreign objects. CHECK: single devices are checked (in order / defect); devices can be
 * added at any time.
 */
public enum InspectionMode {
    INVENTORY,
    CHECK
}
