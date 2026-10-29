package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.User;

public interface AppUserRepository extends JpaRepository<User, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    Optional<User> findForNotificationsByUuid(UUID uuid);
    Optional<User> findByUuid(UUID uuid);
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
}
