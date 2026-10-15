package com.jpromi.inventorycore.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import com.jpromi.inventorycore.config.SecurityConfig;
import com.jpromi.inventorycore.dto.GeocodingResult;
import com.jpromi.inventorycore.ldap.LdapAuthenticationProvider;
import com.jpromi.inventorycore.oidc.DynamicClientRegistrationRepository;
import com.jpromi.inventorycore.oidc.OidcLoginHandler;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.service.GeocodingService;
import com.jpromi.inventorycore.service.PermissionService;

@WebMvcTest(GeocodingController.class)
@Import(SecurityConfig.class)
class GeocodingControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean GeocodingService geocoding;
    @MockitoBean PermissionService permissions;
    @MockitoBean AppUserRepository users;
    @MockitoBean TransactionTemplate transaction;
    @MockitoBean LdapAuthenticationProvider ldap;
    @MockitoBean DynamicClientRegistrationRepository registrations;
    @MockitoBean OidcLoginHandler oidc;

    @Test
    void anonymousUsersCannotUseTheGeocoder() throws Exception {
        mvc.perform(get("/api/geocoding/search").param("q", "Wien")).andExpect(status().isUnauthorized());
        verifyNoInteractions(geocoding);
    }

    @Test
    @WithMockUser
    void usersWithoutLocationRightsAreRejected() throws Exception {
        when(permissions.context(any())).thenReturn(new AccessContext(false, List.of()));
        mvc.perform(get("/api/geocoding/search").param("q", "Wien")).andExpect(status().isForbidden());
        mvc.perform(get("/api/geocoding/reverse").param("lat", "48.2").param("lon", "16.37")).andExpect(status().isForbidden());
        verifyNoInteractions(geocoding);
    }

    @Test
    @WithMockUser
    void locationEditorsGetResults() throws Exception {
        when(permissions.context(any())).thenReturn(new AccessContext(true, List.of()));
        when(geocoding.search("Wien")).thenReturn(List.of(new GeocodingResult("1010 Wien, Österreich", "Wien, Österreich", null, "1010", "Wien", "Österreich", 48.2, 16.37)));
        when(geocoding.reverse(0, 0)).thenReturn(Optional.empty());

        mvc.perform(get("/api/geocoding/search").param("q", "Wien"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].address").value("1010 Wien, Österreich"))
            .andExpect(jsonPath("$[0].city").value("Wien"))
            .andExpect(jsonPath("$[0].latitude").value(48.2));
        mvc.perform(get("/api/geocoding/reverse").param("lat", "0").param("lon", "0")).andExpect(status().isNotFound());
    }
}
