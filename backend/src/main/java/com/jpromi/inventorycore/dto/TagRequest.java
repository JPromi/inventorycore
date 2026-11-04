package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record TagRequest(
    String name,
    String color,
    UUID areaUuid
) {}
