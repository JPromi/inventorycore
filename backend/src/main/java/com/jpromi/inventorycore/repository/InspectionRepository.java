package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Inspection;
import com.jpromi.inventorycore.entity.InspectionType;

public interface InspectionRepository extends JpaRepository<Inspection, Long> {
    Optional<Inspection> findByUuid(UUID uuid);

    List<Inspection> findAllByOrderByCreatedAtDesc();

    long countByInspectionType(InspectionType inspectionType);

    /** Protocols keep the type name, so a type can be deleted without touching them. */
    @Modifying
    @Query("update Inspection i set i.inspectionType = null where i.inspectionType = :type")
    void detachType(@Param("type") InspectionType type);
}
