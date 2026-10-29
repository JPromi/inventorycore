package com.jpromi.inventorycore.entity;

import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class NotificationPreference {
    @Id
    private UUID userUuid;

    private boolean inbox = true;

    private boolean email;

    private boolean push;

    private boolean overdueInbox = true;

    private boolean overdueEmail;

    private boolean overduePush;

    private int daysBefore = 7;

    private String emailAddress;

}
