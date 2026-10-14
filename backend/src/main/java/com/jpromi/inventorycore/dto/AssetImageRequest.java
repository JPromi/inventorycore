package com.jpromi.inventorycore.dto;

import com.jpromi.inventorycore.enums.ImageKind;

public record AssetImageRequest(
    ImageKind kind,
    String url,
    String fileName,
    String contentType,
    int sortOrder
) {}
