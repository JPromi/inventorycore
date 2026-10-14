package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record LocationRequest(
    String name,
    String description,
    String address,
    UUID parentLocationUuid,
    List<LocationImageRequest> images,
    Set<UUID> areaUuids
) {}
