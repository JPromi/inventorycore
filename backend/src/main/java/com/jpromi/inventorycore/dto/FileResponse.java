package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Metadata of an uploaded file; {@code url} and {@code thumbnailUrl} can be used directly as image source. */
public record FileResponse(
    UUID uuid,
    String url,
    String thumbnailUrl,
    String originalName,
    String contentType,
    long size,
    long originalSize,
    Integer width,
    Integer height,
    OffsetDateTime uploadedAt,
    UUID uploadedByUuid,
    String uploadedByName
) {}
