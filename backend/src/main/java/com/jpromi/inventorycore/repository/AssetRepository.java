package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;

public interface AssetRepository extends JpaRepository<Asset, Long> {
    Optional<Asset> findByUuid(UUID uuid);

    List<Asset> findByDeletedFalse();

    @Query("select e from Asset e join e.areas a where a = :area")
    List<Asset> findByArea(@Param("area") Area area);

    @Query("select count(e) from Asset e join e.areas a where a = :area and e.deleted = false")
    long countByArea(@Param("area") Area area);

    @Query("select e from Asset e where e.areas is empty")
    List<Asset> findWithoutArea();
    boolean existsByInvId(String invId);
}
