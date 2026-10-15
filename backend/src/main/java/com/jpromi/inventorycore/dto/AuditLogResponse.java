package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;

public record AuditLogResponse(
    UUID uuid,
    OffsetDateTime createdAt,
    UUID userUuid,
    String userName,
    AuditAction action,
    AuditObjectType objectType,
    UUID objectUuid,
    String objectName,
    List<AuditDetail> details
) {}
