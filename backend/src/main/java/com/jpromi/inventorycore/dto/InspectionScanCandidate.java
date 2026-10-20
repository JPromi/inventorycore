package com.jpromi.inventorycore.dto;

import java.util.UUID;

/**
 * One of several assets a scanned code matches. {@code matchedBy}: INV_ID, INVENTORY_NUMBER or
 * SERIAL_NUMBER; {@code inInspection}: the asset is on this inspection's list.
 */
public record InspectionScanCandidate(
    UUID uuid,
    String name,
    String invId,
    String assetTypeName,
    String locationName,
    String matchedBy,
    boolean inInspection
) {}
