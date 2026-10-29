package com.jpromi.inventorycore.entity;

import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class NotificationSettings {
    @Id
    private Long id = 1L;

    private boolean enabled;

    private String host;

    private int port = 587;

    private String username;

    private String password;

    private String fromAddress;

    private boolean startTls = true;

    private String vapidPublicKey;

    private String vapidPrivateKey;

}
