package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.UUID;

public record InspectionTypeResponse(
    UUID uuid,
    String name,
    String description,
    String color,
    List<InspectionFieldResponse> fields,
    long inspectionCount
) {}
