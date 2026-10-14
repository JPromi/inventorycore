package com.jpromi.inventorycore.dto;

/** expected = assets selected by the filters; unexpected = found here but belonging elsewhere (or unknown codes). */
public record InspectionCounts(
    int expected,
    int present,
    int missing,
    int pending,
    int unexpected
) {}
