package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.AssetType;

public interface AssetTypeRepository extends JpaRepository<AssetType, Long> {
    Optional<AssetType> findByUuid(UUID uuid);

    List<AssetType> findByDeletedFalse();

    @Query("select e from AssetType e join e.areas a where a = :area")
    List<AssetType> findByArea(@Param("area") Area area);

    @Query("select count(e) from AssetType e join e.areas a where a = :area and e.deleted = false")
    long countByArea(@Param("area") Area area);

    @Query("select e from AssetType e where e.areas is empty")
    List<AssetType> findWithoutArea();
}
