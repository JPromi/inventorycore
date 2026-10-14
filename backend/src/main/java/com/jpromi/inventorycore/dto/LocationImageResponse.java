package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.jpromi.inventorycore.enums.ImageKind;

public record LocationImageResponse(
    UUID uuid,
    ImageKind kind,
    String url,
    String fileName,
    String contentType,
    int sortOrder,
    OffsetDateTime uploadedAt
) {}
