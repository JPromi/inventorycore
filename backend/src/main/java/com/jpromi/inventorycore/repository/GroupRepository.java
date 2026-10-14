package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Group;

public interface GroupRepository extends JpaRepository<Group, Long> {
    Optional<Group> findByUuid(UUID uuid);
}
