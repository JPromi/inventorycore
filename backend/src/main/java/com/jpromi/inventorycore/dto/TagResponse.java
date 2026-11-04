package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record TagResponse(
    UUID uuid,
    String name,
    String color,
    UUID areaUuid
) {
    public TagResponse(UUID uuid, String name, String color) {
        this(uuid, name, color, null);
    }
}
