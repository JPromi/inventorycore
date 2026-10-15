package com.jpromi.inventorycore.dto;

import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.Provider;

public record UserResponse(
    UUID uuid,
    String username,
    String displayName,
    String email,
    String role,
    boolean enabled,
    Set<UUID> groupUuids,
    Provider sourceProvider,
    String profileImageUrl
) {}
