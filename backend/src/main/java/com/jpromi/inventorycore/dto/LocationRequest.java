package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record LocationRequest(
    String name,
    String description,
    /** only used when all address parts are empty (older clients) */
    String address,
    String street,
    String postalCode,
    String city,
    String country,
    Double latitude,
    Double longitude,
    UUID parentLocationUuid,
    List<LocationImageRequest> images,
    Set<UUID> areaUuids
) {}
