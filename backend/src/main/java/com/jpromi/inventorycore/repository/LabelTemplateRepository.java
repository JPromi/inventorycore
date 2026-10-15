package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.LabelTemplate;

public interface LabelTemplateRepository extends JpaRepository<LabelTemplate, Long> {
    Optional<LabelTemplate> findByUuid(UUID uuid);
    List<LabelTemplate> findByArea(Area area);
    List<LabelTemplate> findByAreaAndDefaultForAreaTrue(Area area);
}
