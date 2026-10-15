package com.jpromi.inventorycore.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.dto.LdapSettingsDto;
import com.jpromi.inventorycore.entity.LdapSettings;
import com.jpromi.inventorycore.ldap.LdapService;
import com.jpromi.inventorycore.oidc.DynamicClientRegistrationRepository;
import com.jpromi.inventorycore.repository.LdapSettingsRepository;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;
import com.jpromi.inventorycore.service.AuditService;

class AuthProviderControllerTest {
    @Test
    void exposesLegacySelectionAsEditableFilterAndSavesManualChangesWithoutHiddenRestrictions() {
        var settings = new LdapSettings();
        settings.setRestrictGroups(true);
        settings.setSelectedGroupNames(new LinkedHashSet<>(Set.of("Members")));
        var repository = mock(LdapSettingsRepository.class);
        var audit = mock(AuditService.class);
        when(repository.load()).thenReturn(settings);
        when(repository.save(settings)).thenReturn(settings);
        when(audit.diff(any(), any())).thenReturn(List.of());
        var controller = new AuthProviderController(repository, mock(OidcSettingsRepository.class),
            mock(LdapService.class), mock(DynamicClientRegistrationRepository.class), audit);

        assertEquals("(&(objectClass=group)(|(cn=Members)))", controller.ldap().groupFilter());

        var edited = mock(LdapSettingsDto.class);
        when(edited.syncIntervalValue()).thenReturn(6);
        when(edited.groupFilter()).thenReturn("(&(objectClass=group)(cn=INV-*))");
        var saved = controller.saveLdap(edited);
        assertEquals("(&(objectClass=group)(cn=INV-*))", saved.groupFilter());
        assertEquals(saved.groupFilter(), settings.effectiveGroupFilter());
        assertFalse(settings.isRestrictGroups());
        assertTrue(settings.getSelectedGroupNames().isEmpty());
        verify(repository).save(settings);
    }
}
