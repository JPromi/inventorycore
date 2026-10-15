package com.jpromi.inventorycore.ldap;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.entity.LdapSettings;
import com.jpromi.inventorycore.repository.LdapSettingsRepository;

class LdapSyncSchedulerTest {
    private final OffsetDateTime now = OffsetDateTime.parse("2026-10-15T12:00:00Z");

    private LdapSettings enabledSettings() {
        LdapSettings settings = new LdapSettings();
        settings.setEnabled(true);
        settings.setUrl("ldap://directory.example");
        return settings;
    }

    @Test
    void defaultsToSixHoursAndRunsAtTheBoundary() {
        LdapSettings settings = enabledSettings();
        assertEquals(6, settings.getSyncIntervalValue());
        assertEquals(com.jpromi.inventorycore.enums.LdapSyncIntervalUnit.HOURS, settings.getSyncIntervalUnit());
        assertTrue(LdapSyncScheduler.isDue(settings, now, null));
        settings.setLastSyncAt(now.minusHours(6).plusSeconds(1));
        assertFalse(LdapSyncScheduler.isDue(settings, now, null));
        settings.setLastSyncAt(now.minusHours(6));
        assertTrue(LdapSyncScheduler.isDue(settings, now, null));
    }

    @Test
    void usesUpdatedIntervalAndDoesNotRetryFailedRunsEveryMinute() {
        LdapSettings settings = enabledSettings();
        settings.setLastSyncAt(now.minusHours(12));
        assertFalse(LdapSyncScheduler.isDue(settings, now, now.minusMinutes(1)));
        settings.setSyncIntervalValue(1);
        assertTrue(LdapSyncScheduler.isDue(settings, now, now.minusHours(1)));
        settings.setEnabled(false);
        assertFalse(LdapSyncScheduler.isDue(settings, now, null));
    }

    @Test
    void supportsMinutesAndDaysAtTheirExactBoundaries() {
        LdapSettings settings = enabledSettings();
        settings.setSyncIntervalValue(15);
        settings.setSyncIntervalUnit(com.jpromi.inventorycore.enums.LdapSyncIntervalUnit.MINUTES);
        settings.setLastSyncAt(now.minusMinutes(15).plusSeconds(1));
        assertFalse(LdapSyncScheduler.isDue(settings, now, null));
        settings.setLastSyncAt(now.minusMinutes(15));
        assertTrue(LdapSyncScheduler.isDue(settings, now, null));
        settings.setSyncIntervalValue(2);
        settings.setSyncIntervalUnit(com.jpromi.inventorycore.enums.LdapSyncIntervalUnit.DAYS);
        settings.setLastSyncAt(now.minusDays(2).plusSeconds(1));
        assertFalse(LdapSyncScheduler.isDue(settings, now, null));
        settings.setLastSyncAt(now.minusDays(2));
        assertTrue(LdapSyncScheduler.isDue(settings, now, null));
    }

    @Test
    void invokesSyncOnlyWhenEnabledAndDue() {
        var repository = mock(LdapSettingsRepository.class);
        var service = mock(LdapService.class);
        var settings = enabledSettings();
        when(repository.load()).thenReturn(settings);
        when(service.sync()).thenReturn(new LdapService.SyncResult(false, "offline", 0, 0, 0, 0, 0, 0, 0));
        var scheduler = new LdapSyncScheduler(repository, service);
        scheduler.syncIfDue();
        scheduler.syncIfDue();
        verify(service, times(1)).sync();
    }
}
