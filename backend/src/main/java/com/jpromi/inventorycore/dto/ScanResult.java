package com.jpromi.inventorycore.dto;

import java.util.List;

/**
 * Result of a scanned code. {@code matchedBy} says how the code was understood:
 * LINK (url to an asset/location), UUID, CODE (inventory id, inventory number or serial number) or NONE.
 */
public record ScanResult(
    String code,
    String matchedBy,
    List<AssetResponse> assets,
    List<LocationResponse> locations
) {}
