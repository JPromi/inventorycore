package com.jpromi.inventorycore.service;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.jpromi.inventorycore.repository.*;

@Service
public class NotificationDeliveryService {
    private static final Logger log = LoggerFactory.getLogger(NotificationDeliveryService.class);
    private final NotificationMessageRepository messages;
    private final NotificationSubscriptionRepository subscriptions;
    private final AppUserRepository users;
    private final NotificationService service;
    private final PermissionService permissions;
    private final NotificationTransport transport;

    public NotificationDeliveryService(NotificationMessageRepository messages,
        NotificationSubscriptionRepository subscriptions, AppUserRepository users,
        NotificationService service, PermissionService permissions, NotificationTransport transport) {
        this.messages = messages;
        this.subscriptions = subscriptions;
        this.users = users;
        this.service = service;
        this.permissions = permissions;
        this.transport = transport;
    }

    @Transactional
    public void deliver(UUID uuid) {
        var message = messages.findLockedByUuid(uuid).orElseThrow();
        var user = users.findByUuid(message.getUserUuid()).orElse(null);
        if (user == null || !user.isEnabled() || !service.visible(message,
            new AccessContext(user.isAdmin(), permissions.permissionsOf(user)))) {
            message.setEmailPending(false);
            message.setPushPending(false);
            return;
        }
        var p = service.preference(user);
        var s = service.settings();
        message.setAttempts(message.getAttempts() + 1);
        if (message.isEmailPending()) {
            if (!(message.isOverdue() ? p.isOverdueEmail() : p.isEmail()) || !NotificationService.mailAvailable(s)) {
                message.setEmailPending(false);
            } else {
                try {
                    transport.sendMail(s, p.getEmailAddress(), message.getTitle(), message.getBody());
                    message.setEmailPending(false);
                } catch (Exception e) {
                    // Do not log SMTP credentials, addresses or provider response bodies.
                    log.warn("Email notification {} failed ({})", uuid, e.getClass().getSimpleName());
                }
            }
        }
        if (message.isPushPending()) {
            boolean failed = false;
            if (message.isOverdue() ? p.isOverduePush() : p.isPush()) {
                for (var subscription : subscriptions.findByUserUuid(user.getUuid())) {
                    try {
                        int status = transport.sendPush(s, subscription);
                        if (status == 404 || status == 410) subscriptions.delete(subscription);
                        else if (status < 200 || status >= 300) failed = true;
                    } catch (Exception e) {
                        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
                        failed = true;
                        log.warn("Push notification {} failed ({})", uuid, e.getClass().getSimpleName());
                    }
                }
            }
            message.setPushPending(failed);
        }
        if (message.getAttempts() >= 5) {
            message.setEmailPending(false);
            message.setPushPending(false);
        }
    }
}
