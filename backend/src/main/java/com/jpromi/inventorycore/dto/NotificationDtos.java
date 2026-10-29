package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class NotificationDtos {
    private NotificationDtos() {}

    public record Preferences(boolean inbox, boolean email, boolean push, int daysBefore,
        String emailAddress, boolean emailAvailable, String pushPublicKey,
        boolean overdueInbox, boolean overdueEmail, boolean overduePush) {}

    public record Message(UUID uuid, String title, String body, UUID assetUuid,
        OffsetDateTime createdAt, OffsetDateTime readAt) {}

    /** Password is write-only; null preserves the stored password, empty clears it. */
    public record MailSettings(boolean enabled, String host, int port, String username,
        String password, boolean passwordConfigured, String fromAddress, boolean startTls) {}

    public record Subscription(String endpoint, Keys keys) {
        public record Keys(String p256dh, String auth) {}
    }
}
