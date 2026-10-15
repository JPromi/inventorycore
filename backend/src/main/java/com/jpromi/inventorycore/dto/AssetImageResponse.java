package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.jpromi.inventorycore.enums.ImageKind;

public record AssetImageResponse(
    UUID uuid,
    ImageKind kind,
    UUID fileUuid,
    String url,
    String thumbnailUrl,
    String fileName,
    String contentType,
    int sortOrder,
    OffsetDateTime uploadedAt
) {}
