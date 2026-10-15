package com.jpromi.inventorycore.dto;

import java.util.Set;

public record GroupRequest(
    String name,
    Set<GroupPermissionRequest> permissions,
    boolean adminGroup
) {}
