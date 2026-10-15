package com.jpromi.inventorycore.dto;

import java.util.List;

/** A page of protocols plus the tab counts (within the area selection, independent of search and status). */
public record InspectionPageResponse(
    List<InspectionSummaryResponse> items,
    long total,
    int page,
    int size,
    boolean hasMore,
    long openCount,
    long completedCount
) {}
