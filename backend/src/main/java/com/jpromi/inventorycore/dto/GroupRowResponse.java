package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.Provider;

/** A group in the admin list: the group plus its member count and the first few members. */
public record GroupRowResponse(
    UUID uuid,
    String name,
    Provider sourceProvider,
    Set<GroupPermissionResponse> permissions,
    boolean adminGroup,
    long memberCount,
    List<UserResponse> members
) {}
