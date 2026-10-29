package com.jpromi.inventorycore.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.NotificationMessageRepository;

@Component
public class NotificationScheduler {
    private static final Logger log = LoggerFactory.getLogger(NotificationScheduler.class);
    private final AppUserRepository users;
    private final NotificationMessageRepository messages;
    private final NotificationService service;
    private final NotificationDeliveryService delivery;

    public NotificationScheduler(AppUserRepository users, NotificationMessageRepository messages,
        NotificationService service, NotificationDeliveryService delivery) {
        this.users = users;
        this.messages = messages;
        this.service = service;
        this.delivery = delivery;
    }

    @Scheduled(initialDelay = 60000, fixedDelay = 3600000)
    public void run() {
        for (var user : users.findAll()) {
            try {
                service.generate(user.getUuid());
            } catch (Exception e) {
                log.warn("Notification generation failed for {} ({})", user.getUuid(), e.getClass().getSimpleName());
            }
        }
    }

    @Scheduled(initialDelay = 90000, fixedDelay = 60000)
    public void deliverPending() {
        for (var message : messages.findTop100ByEmailPendingTrueOrPushPendingTrueOrderByCreatedAtAsc()) {
            try {
                delivery.deliver(message.getUuid());
            } catch (Exception e) {
                log.warn("Notification delivery failed for {} ({})", message.getUuid(), e.getClass().getSimpleName());
            }
        }
    }
}
