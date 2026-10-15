package com.jpromi.inventorycore.dto;

import java.util.UUID;

/**
 * {@code assetUuid}: the user's choice after an AMBIGUOUS answer; it must be one of the assets the code
 * matches, so the choice cannot reach other assets.
 */
public record InspectionScanRequest(String code, UUID assetUuid) {}
