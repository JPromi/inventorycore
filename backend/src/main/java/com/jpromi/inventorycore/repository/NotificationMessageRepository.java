package com.jpromi.inventorycore.repository;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import com.jpromi.inventorycore.entity.NotificationMessage;

public interface NotificationMessageRepository extends JpaRepository<NotificationMessage, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    Optional<NotificationMessage> findLockedByUuid(UUID uuid);
    List<NotificationMessage> findByUserUuidOrderByCreatedAtDesc(UUID userUuid);
    boolean existsByEventKey(String eventKey);
    List<NotificationMessage> findTop100ByEmailPendingTrueOrPushPendingTrueOrderByCreatedAtAsc();
}
