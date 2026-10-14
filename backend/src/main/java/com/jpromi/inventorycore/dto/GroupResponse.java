package com.jpromi.inventorycore.dto;

import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.Provider;

public record GroupResponse(
    UUID uuid,
    String name,
    Provider sourceProvider,
    Set<GroupPermissionResponse> permissions
) {}
