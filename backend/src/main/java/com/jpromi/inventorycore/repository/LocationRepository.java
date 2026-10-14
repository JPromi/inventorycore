package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Location;

public interface LocationRepository extends JpaRepository<Location, Long> {
    Optional<Location> findByUuid(UUID uuid);
}
