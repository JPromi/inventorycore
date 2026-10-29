package com.jpromi.inventorycore.repository;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import com.jpromi.inventorycore.entity.NotificationSubscription;

public interface NotificationSubscriptionRepository extends JpaRepository<NotificationSubscription, UUID> {
    List<NotificationSubscription> findByUserUuid(UUID userUuid);
    Optional<NotificationSubscription> findByEndpoint(String endpoint);
}
