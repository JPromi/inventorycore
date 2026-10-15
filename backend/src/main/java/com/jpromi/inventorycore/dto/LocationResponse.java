package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record LocationResponse(
    UUID uuid,
    String name,
    String description,
    String address,
    String street,
    String postalCode,
    String city,
    String country,
    Double latitude,
    Double longitude,
    UUID parentLocationUuid,
    List<UUID> childLocationUuids,
    List<UUID> assetUuids,
    List<LocationImageResponse> images,
    OffsetDateTime createdAt,
    OffsetDateTime deletedAt,
    boolean deleted,
    List<UUID> areaUuids
) {}
