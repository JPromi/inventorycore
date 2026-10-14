package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record InspectionPhotoResponse(
    UUID uuid,
    UUID fileUuid,
    String url,
    String thumbnailUrl,
    OffsetDateTime takenAt,
    String takenByName
) {}
