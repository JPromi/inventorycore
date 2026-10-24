package com.jpromi.inventorycore.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.LabelSettings;

public interface LabelSettingsRepository extends JpaRepository<LabelSettings, Long> {

    /** The settings row, or defaults (not yet saved) when nothing was configured. */
    default LabelSettings load() {
        return findById(LabelSettings.SINGLETON_ID).orElseGet(LabelSettings::new);
    }
}
