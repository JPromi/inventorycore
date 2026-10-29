package com.jpromi.inventorycore.entity;

import java.util.UUID;
import java.time.OffsetDateTime;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class NotificationMessage {
    @Id
    private UUID uuid = UUID.randomUUID();

    @Column(nullable=false)
    private UUID userUuid;

    @Column(nullable=false,unique=true,length=250)
    private String eventKey;

    private UUID assetUuid;

    private UUID inspectionTypeUuid;

    private String title;

    @Column(length=2000)
    private String body;

    private OffsetDateTime createdAt = OffsetDateTime.now();

    private OffsetDateTime readAt;

    private boolean inbox;

    private boolean overdue;

    private boolean emailPending;

    private boolean pushPending;

    private int attempts;

}
