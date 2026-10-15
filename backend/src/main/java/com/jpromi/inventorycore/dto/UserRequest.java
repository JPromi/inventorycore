package com.jpromi.inventorycore.dto;

import java.util.Set;
import java.util.UUID;

public record UserRequest(
    String username,
    String displayName,
    String password,
    String email,
    String role,
    boolean enabled,
    Set<UUID> groupUuids
) {}
