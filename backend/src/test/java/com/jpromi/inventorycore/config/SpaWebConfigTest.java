package com.jpromi.inventorycore.config;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class SpaWebConfigTest {

    @Test
    void clientRoutesFallBackToTheAngularApp() {
        assertTrue(SpaWebConfig.isClientRoute(""));
        assertTrue(SpaWebConfig.isClientRoute("assets/0b0e7c2a-1d7e-4c55-9f00-3f1c2d6a8e11"));
        assertTrue(SpaWebConfig.isClientRoute("login"));
    }

    @Test
    void backendPathsAndMissingFilesStayNotFound() {
        assertFalse(SpaWebConfig.isClientRoute("api/unknown"));
        assertFalse(SpaWebConfig.isClientRoute("api"));
        assertFalse(SpaWebConfig.isClientRoute("oauth2/authorization/oidc"));
        assertFalse(SpaWebConfig.isClientRoute("login/oauth2/code/oidc"));
        assertFalse(SpaWebConfig.isClientRoute("main-ABC123.js"));
        assertFalse(SpaWebConfig.isClientRoute("icons/missing.svg"));
    }
}
