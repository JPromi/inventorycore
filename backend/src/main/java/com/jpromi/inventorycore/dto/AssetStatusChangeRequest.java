package com.jpromi.inventorycore.dto;

import java.util.UUID;

public record AssetStatusChangeRequest(
    UUID statusUuid,
    String comment
) {}
