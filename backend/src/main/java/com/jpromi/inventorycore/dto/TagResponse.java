package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record TagResponse(
    UUID uuid,
    String name,
    String color
) {}
