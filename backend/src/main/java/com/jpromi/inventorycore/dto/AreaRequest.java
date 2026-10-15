package com.jpromi.inventorycore.dto;

public record AreaRequest(
    String name,
    String description,
    String color,
    boolean defaultArea
) {}
