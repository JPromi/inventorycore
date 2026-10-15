package com.jpromi.inventorycore.controller;

import static org.mockito.ArgumentMatchers.any;
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
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.service.CustomizationService;

@WebMvcTest(CustomizationController.class)
@Import(SecurityConfig.class)
class CustomizationSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean CustomizationService service;
    @MockitoBean AuditService audit;
    @MockitoBean AppUserRepository users;
    @MockitoBean TransactionTemplate transaction;
    @MockitoBean LdapAuthenticationProvider ldap;
    @MockitoBean DynamicClientRegistrationRepository registrations;
    @MockitoBean OidcLoginHandler oidc;

    @Test
    void anonymousCanReadBrandingButCannotWrite() throws Exception {
        mvc.perform(get("/api/customization")).andExpect(status().isOk());
        mvc.perform(get("/api/customization/logo")).andExpect(status().isOk());
        mvc.perform(put("/api/admin/customization").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
        verify(service, never()).save(any());
    }

    @Test
    @WithMockUser(roles = "USER")
    void regularUsersCannotChangeSettingsOrLogo() throws Exception {
        mvc.perform(put("/api/admin/customization").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/customization/logo")).andExpect(status().isForbidden());
        mvc.perform(multipart("/api/admin/customization/logo").file("file", new byte[] { 1, 2, 3 }))
            .andExpect(status().isForbidden());
        verify(service, never()).save(any());
        verify(service, never()).removeLogo();
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminsCanWriteSettings() throws Exception {
        mvc.perform(put("/api/admin/customization").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
        verify(service).save(any());
    }
}
