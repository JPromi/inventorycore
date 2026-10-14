package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.AssetType;

public interface AssetTypeRepository extends JpaRepository<AssetType, Long> {
    Optional<AssetType> findByUuid(UUID uuid);
}
