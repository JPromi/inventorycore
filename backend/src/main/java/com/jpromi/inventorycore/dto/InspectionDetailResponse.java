package com.jpromi.inventorycore.dto;

import java.util.List;

/** {@code fields} are the current check fields of the type; completed protocols show the copied values instead. */
public record InspectionDetailResponse(
    InspectionSummaryResponse summary,
    String comment,
    InspectionFilter filter,
    List<InspectionFieldResponse> fields,
    List<InspectionItemResponse> items
) {}
