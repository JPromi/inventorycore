package com.jpromi.inventorycore.dto;

/**
 * expected = assets in the inspection (inventory: selected by the filters); unexpected = found here
 * but belonging elsewhere (or unknown codes). Inventory uses present/missing, single checks
 * passed/failed; pending = not checked yet.
 */
public record InspectionCounts(
    int expected,
    int present,
    int missing,
    int passed,
    int failed,
    int pending,
    int unexpected
) {}
