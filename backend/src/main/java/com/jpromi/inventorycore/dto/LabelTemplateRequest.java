package com.jpromi.inventorycore.dto;

import java.util.UUID;

/** {@code safeAreaMm} null = the admin default from the label settings. */
public record LabelTemplateRequest(
    String name,
    String description,
    UUID areaUuid,
    boolean defaultForArea,
    double widthMm,
    double heightMm,
    Double safeAreaMm,
    String elementsJson
) {}
