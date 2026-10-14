package com.jpromi.inventorycore.dto;

import java.util.Set;
import java.util.UUID;

public record UserResponse(
    UUID uuid,
    String username,
    String displayName,
    String email,
    String role,
    boolean enabled,
    Set<UUID> groupUuids
) {}
