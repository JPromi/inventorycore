package com.jpromi.inventorycore.dto;

import java.util.List;

public record InspectionTypeRequest(
    String name,
    String description,
    String color,
    List<InspectionFieldRequest> fields
) {}
