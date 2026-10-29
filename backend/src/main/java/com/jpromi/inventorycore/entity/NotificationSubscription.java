package com.jpromi.inventorycore.entity;

import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class NotificationSubscription {
    @Id
    private UUID uuid = UUID.randomUUID();

    @Column(nullable=false)
    private UUID userUuid;

    @Column(nullable=false,unique=true,length=2000)
    private String endpoint;

    @Column(length=200)
    private String p256dh;

    @Column(length=100)
    private String auth;

}
