package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record InspectionCreateRequest(
    UUID inspectionTypeUuid,
    String title,
    InspectionFilter filter
) {}
