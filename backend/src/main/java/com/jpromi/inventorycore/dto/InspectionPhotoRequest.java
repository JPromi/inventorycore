package com.jpromi.inventorycore.dto;

import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionPhotoTarget;

/** An uploaded image ({@code POST /api/files}) that goes into the protocol or into the asset's images. */
public record InspectionPhotoRequest(UUID fileUuid, InspectionPhotoTarget target) {}
