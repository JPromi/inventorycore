package com.jpromi.inventorycore.ldap;

import java.time.OffsetDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.jpromi.inventorycore.entity.LdapSettings;
import com.jpromi.inventorycore.repository.LdapSettingsRepository;

@Component
@EnableScheduling
public class LdapSyncScheduler {
    private static final Logger log = LoggerFactory.getLogger(LdapSyncScheduler.class);
    private final LdapSettingsRepository settingsRepository;
    private final LdapService service;
    private OffsetDateTime lastAttempt;

    public LdapSyncScheduler(LdapSettingsRepository settingsRepository, LdapService service) {
        this.settingsRepository = settingsRepository;
        this.service = service;
    }

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    public void syncIfDue() {
        try {
            LdapSettings settings = settingsRepository.load();
            if (!isDue(settings, OffsetDateTime.now(), lastAttempt)) {
                return;
            }
            lastAttempt = OffsetDateTime.now();
            var result = service.sync();
            if (!result.success()) {
                log.warn("Scheduled LDAP sync failed: {}", result.message());
            }
        } catch (RuntimeException exception) {
            log.error("Scheduled LDAP sync failed", exception);
        }
    }

    static boolean isDue(LdapSettings settings, OffsetDateTime now, OffsetDateTime lastAttempt) {
        if (!settings.isEnabled() || settings.getUrl() == null || settings.getUrl().isBlank()) {
            return false;
        }
        OffsetDateTime previous = settings.getLastSyncAt();
        if (lastAttempt != null && (previous == null || lastAttempt.isAfter(previous))) {
            previous = lastAttempt;
        }
        long minutes = settings.getSyncIntervalUnit().toMinutes(Math.max(1, settings.getSyncIntervalValue()));
        return previous == null || !previous.plusMinutes(minutes).isAfter(now);
    }
}
