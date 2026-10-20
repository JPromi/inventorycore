package com.jpromi.inventorycore.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationManager;

import com.jpromi.inventorycore.entity.OidcSettings;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;
import com.jpromi.inventorycore.service.ApiMapper;

class AuthControllerTest {

    private AuthController controller(OidcSettings settings) {
        var repository = mock(OidcSettingsRepository.class);
        when(repository.load()).thenReturn(settings);
        return new AuthController(mock(AuthenticationManager.class), mock(AppUserRepository.class), mock(ApiMapper.class), repository);
    }

    private static OidcSettings configured(boolean enabled, boolean autoRedirect) {
        var settings = new OidcSettings();
        settings.setEnabled(enabled);
        settings.setIssuerUri("https://sso.example.org/realms/feuerwehr");
        settings.setClientId("inventorycore");
        settings.setAutoRedirect(autoRedirect);
        return settings;
    }

    @Test
    void autoRedirectIsOfferedOnlyForAWorkingOidcLogin() {
        assertTrue(controller(configured(true, true)).providers().oidcAutoRedirect());
        assertFalse(controller(configured(true, false)).providers().oidcAutoRedirect());
        // switched off or incomplete: the login page must stay usable
        assertFalse(controller(configured(false, true)).providers().oidcAutoRedirect());
        var incomplete = configured(true, true);
        incomplete.setClientId(null);
        assertFalse(controller(incomplete).providers().oidcAutoRedirect());
    }
}
