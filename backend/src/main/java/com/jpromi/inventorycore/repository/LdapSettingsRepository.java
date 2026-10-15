package com.jpromi.inventorycore.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.LdapSettings;

public interface LdapSettingsRepository extends JpaRepository<LdapSettings, Long> {

    /** The settings row, or defaults (not yet saved) when nothing was configured. */
    default LdapSettings load() {
        return findById(LdapSettings.SINGLETON_ID).orElseGet(LdapSettings::new);
    }
}
