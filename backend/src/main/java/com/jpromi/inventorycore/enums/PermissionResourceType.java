package com.jpromi.inventorycore.enums;

public enum PermissionResourceType {
    ASSET,
    LOCATION,
    ASSET_TYPE,
    /** Tasks with checklists; INSPECT allows carrying out every task of the area, not only assigned ones. */
    TASK
}
