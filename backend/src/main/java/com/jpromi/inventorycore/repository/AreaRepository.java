package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Area;

public interface AreaRepository extends JpaRepository<Area, Long> {
    Optional<Area> findByUuid(UUID uuid);
    Optional<Area> findFirstByDefaultAreaTrue();
    boolean existsByName(String name);
}
