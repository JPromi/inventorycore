package com.jpromi.inventorycore.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.OidcSettings;

public interface OidcSettingsRepository extends JpaRepository<OidcSettings, Long> {

    /** The settings row, or defaults (not yet saved) when nothing was configured. */
    default OidcSettings load() {
        return findById(OidcSettings.SINGLETON_ID).orElseGet(OidcSettings::new);
    }
}
