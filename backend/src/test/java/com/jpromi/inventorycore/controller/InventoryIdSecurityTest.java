package com.jpromi.inventorycore.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import com.jpromi.inventorycore.config.SecurityConfig;
import com.jpromi.inventorycore.ldap.LdapAuthenticationProvider;
import com.jpromi.inventorycore.oidc.DynamicClientRegistrationRepository;
import com.jpromi.inventorycore.oidc.OidcLoginHandler;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.service.PermissionService;

@WebMvcTest(InventoryIdSettingsController.class)
@Import(SecurityConfig.class)
class InventoryIdSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean com.jpromi.inventorycore.service.InventoryIdService service;
    @MockitoBean com.jpromi.inventorycore.repository.InventoryIdSettingsRepository settings;
    @MockitoBean com.jpromi.inventorycore.repository.AssetRepository assets;
    @MockitoBean com.jpromi.inventorycore.service.AuditService audit;
    @MockitoBean PermissionService permissions;
    @MockitoBean AppUserRepository users;
    @MockitoBean TransactionTemplate transaction;
    @MockitoBean LdapAuthenticationProvider ldap;
    @MockitoBean DynamicClientRegistrationRepository registrations;
    @MockitoBean OidcLoginHandler oidc;

    @Test void anonymousDenied() throws Exception { checkDenied(401); }
    @Test @WithMockUser(roles = "USER") void regularUserDenied() throws Exception { checkDenied(403); }
    private void checkDenied(int code) throws Exception {
        String path = "/api/admin/inventory-id-settings";
        mvc.perform(get(path)).andExpect(status().is(code));
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().is(code));
        mvc.perform(post(path+"/regenerate").contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().is(code));
        verifyNoInteractions(service, assets, settings);
    }
    @Test @WithMockUser(roles = "ADMIN") void adminCanRead() throws Exception {
        when(service.pattern()).thenReturn("INV-{random_number:10}");
        mvc.perform(get("/api/admin/inventory-id-settings")).andExpect(status().isOk()).andExpect(jsonPath("$.pattern").value("INV-{random_number:10}"));
    }
}
