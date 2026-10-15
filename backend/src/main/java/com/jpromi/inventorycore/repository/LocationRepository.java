package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Location;

public interface LocationRepository extends JpaRepository<Location, Long> {
    Optional<Location> findByUuid(UUID uuid);

    List<Location> findByDeletedFalse();

    @Query("select e from Location e join e.areas a where a = :area")
    List<Location> findByArea(@Param("area") Area area);

    @Query("select count(e) from Location e join e.areas a where a = :area and e.deleted = false")
    long countByArea(@Param("area") Area area);

    @Query("select e from Location e where e.areas is empty")
    List<Location> findWithoutArea();
}
