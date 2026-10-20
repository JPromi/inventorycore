package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.AssetStatus;
import com.jpromi.inventorycore.enums.AssetStatusKey;

public interface AssetStatusRepository extends JpaRepository<AssetStatus, Long> {
    Optional<AssetStatus> findByUuid(UUID uuid);

    Optional<AssetStatus> findBySystemKey(AssetStatusKey key);

    List<AssetStatus> findByDeletedFalse();

    List<AssetStatus> findByAreaAndDeletedFalse(Area area);

    List<AssetStatus> findByArea(Area area);

    @Query("select count(a) from Asset a where a.status = ?1 and a.deleted = false")
    long countAssetsWith(AssetStatus status);
}
