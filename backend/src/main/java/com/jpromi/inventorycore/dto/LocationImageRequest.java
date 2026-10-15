package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.ImageKind;

public record LocationImageRequest(
    ImageKind kind,
    UUID fileUuid,
    String url,
    String fileName,
    String contentType,
    int sortOrder
) {}
