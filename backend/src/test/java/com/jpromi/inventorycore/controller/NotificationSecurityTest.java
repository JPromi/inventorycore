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
import com.jpromi.inventorycore.service.NotificationService;
import com.jpromi.inventorycore.service.PermissionService;

@WebMvcTest(NotificationController.class)
@Import(SecurityConfig.class)
class NotificationSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean NotificationService service;
    @MockitoBean PermissionService permissions;
    @MockitoBean AppUserRepository users;
    @MockitoBean TransactionTemplate transaction;
    @MockitoBean LdapAuthenticationProvider ldap;
    @MockitoBean DynamicClientRegistrationRepository registrations;
    @MockitoBean OidcLoginHandler oidc;

    @Test
    void anonymousCannotReadInboxPreferencesOrSmtpSettings() throws Exception {
        for (String path : new String[] { "/api/notifications", "/api/notifications/preferences", "/api/admin/notifications" }) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        verifyNoInteractions(service);
    }

    @Test
    @WithMockUser(roles = "USER")
    void regularUsersCannotReadOrChangeSmtpConfiguration() throws Exception {
        mvc.perform(get("/api/admin/notifications")).andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/notifications").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminsCanConfigureDelivery() throws Exception {
        mvc.perform(get("/api/admin/notifications")).andExpect(status().isOk());
        mvc.perform(put("/api/admin/notifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"port\":587,\"enabled\":false,\"passwordConfigured\":false,\"startTls\":true}"))
            .andExpect(status().isOk());
        verify(service).saveMailSettings(any());
    }
}
