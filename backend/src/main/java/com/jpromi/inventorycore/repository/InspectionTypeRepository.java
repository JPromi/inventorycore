package com.jpromi.inventorycore.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.InspectionType;

public interface InspectionTypeRepository extends JpaRepository<InspectionType, Long> {
    Optional<InspectionType> findByUuid(UUID uuid);
}
