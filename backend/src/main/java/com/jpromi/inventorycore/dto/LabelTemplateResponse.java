package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record LabelTemplateResponse(
    UUID uuid,
    String name,
    String description,
    UUID areaUuid,
    boolean defaultForArea,
    double widthMm,
    double heightMm,
    String elementsJson
) {}
