package com.jpromi.inventorycore.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.jpromi.inventorycore.entity.Customization;

public interface CustomizationRepository extends JpaRepository<Customization, Long> {}
