package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/** One entry of the status history; {@code inspectionUuid} is set when an inspection set the status. */
public record AssetStatusChangeResponse(
    UUID uuid,
    AssetStatusResponse fromStatus,
    AssetStatusResponse toStatus,
    String comment,
    OffsetDateTime changedAt,
    String changedByName,
    UUID inspectionUuid,
    String inspectionTitle
) {}
