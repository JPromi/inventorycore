package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.InspectionType;
import com.jpromi.inventorycore.entity.Area;

public interface InspectionTypeRepository extends JpaRepository<InspectionType, Long> {
    @Modifying
    @Query("update InspectionType t set t.protocolArea = :replacement where t.protocolArea = :area")
    void moveProtocolArea(@Param("area") Area area, @Param("replacement") Area replacement);
    Optional<InspectionType> findByUuid(UUID uuid);
}
