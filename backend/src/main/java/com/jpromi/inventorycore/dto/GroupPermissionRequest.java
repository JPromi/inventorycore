package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.PermissionResourceType;

public record GroupPermissionRequest(
    PermissionResourceType resourceType,
    UUID areaUuid,
    boolean canView,
    boolean canEdit,
    boolean canInspect,
    boolean canDelete,
    boolean admin,
    boolean canCreate
) {}
