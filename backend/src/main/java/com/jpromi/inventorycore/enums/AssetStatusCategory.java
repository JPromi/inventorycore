package com.jpromi.inventorycore.enums;

/**
 * What a status means for the app. Custom statuses choose one of these, so the inspection
 * automation, the filter and the display work for them as for the built-in ones.
 * ACTIVE = in use, DEFECT = not usable, MISSING = not found, RETIRED = out of service (shown grey,
 * no longer due for inspections).
 */
public enum AssetStatusCategory {
    ACTIVE,
    DEFECT,
    MISSING,
    RETIRED
}
