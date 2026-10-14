package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Asset;

public interface AssetRepository extends JpaRepository<Asset, Long> {
    Optional<Asset> findByUuid(UUID uuid);
    boolean existsByInvId(String invId);
}
