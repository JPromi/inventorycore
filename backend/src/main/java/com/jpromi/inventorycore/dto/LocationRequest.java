package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record LocationRequest(
    String name,
    String description,
    com.jpromi.inventorycore.enums.LocationType locationType,
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
    Set<UUID> areaUuids,
    /** null keeps the current value (older clients) */
    Boolean shared
) {}
