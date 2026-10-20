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
import com.jpromi.inventorycore.enums.BrandingMode;
import org.springframework.http.ResponseEntity;

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
        when(service.image(any())).thenReturn(ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(new byte[] { 1, 2 }));
        mvc.perform(get("/api/customization")).andExpect(status().isOk());
        mvc.perform(get("/api/customization/logo")).andExpect(status().isOk());
        mvc.perform(get("/api/customization/logo").param("mode", "light")).andExpect(status().isOk());
        mvc.perform(get("/api/customization/logo").param("mode", "dark"))
            .andExpect(status().isOk()).andExpect(content().bytes(new byte[] { 1, 2 }));
        verify(service, times(2)).image(BrandingMode.light);
        verify(service).image(BrandingMode.dark);
        mvc.perform(put("/api/admin/customization").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
        verify(service, never()).save(any());
        mvc.perform(delete("/api/admin/customization/logo").param("mode", "dark"))
            .andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/admin/customization/logo").file("file", new byte[] { 1 }).param("mode", "dark"))
            .andExpect(status().isUnauthorized());
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
        mvc.perform(delete("/api/admin/customization/logo").param("mode", "dark")).andExpect(status().isForbidden());
        mvc.perform(multipart("/api/admin/customization/logo").file("file", new byte[] { 1 }).param("mode", "dark"))
            .andExpect(status().isForbidden());
        verify(service, never()).removeLogo(any());
        verify(service, never()).logo(any(), any());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminsCanWriteSettings() throws Exception {
        mvc.perform(put("/api/admin/customization").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
        verify(service).save(any());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void acceptsExplicitNullAdvancedThemeAsFalseAndReadsNewFields() throws Exception {
        mvc.perform(put("/api/admin/customization").contentType(MediaType.APPLICATION_JSON)
            .content("{\"advancedThemeEnabled\":null}"))
            .andExpect(status().isOk());
        verify(service).save(argThat(request -> !request.advancedThemeEnabled()));
        mvc.perform(put("/api/admin/customization").contentType(MediaType.APPLICATION_JSON)
            .content("{\"advancedThemeEnabled\":true,\"darkBrandColor\":\"#123456\"}"))
            .andExpect(status().isOk());
        verify(service).save(argThat(request -> request.advancedThemeEnabled()
            && "#123456".equals(request.darkBrandColor())));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void routesLogoMutationsToRequestedModeAndDefaultsToLight() throws Exception {
        for (String mode : new String[] { "light", "dark" }) {
            mvc.perform(multipart("/api/admin/customization/logo").file("file", new byte[] { 1 }).param("mode", mode))
                .andExpect(status().isOk());
            mvc.perform(delete("/api/admin/customization/logo").param("mode", mode)).andExpect(status().isOk());
        }
        mvc.perform(multipart("/api/admin/customization/logo").file("file", new byte[] { 1 })).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/customization/logo")).andExpect(status().isOk());
        verify(service, times(2)).logo(any(), eq(BrandingMode.light));
        verify(service).logo(any(), eq(BrandingMode.dark));
        verify(service, times(2)).removeLogo(BrandingMode.light);
        verify(service).removeLogo(BrandingMode.dark);
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void rejectsInvalidModesBeforeCallingService() throws Exception {
        for (String mode : new String[] { "invalid", "DARK", "../light" }) {
            mvc.perform(get("/api/customization/logo").param("mode", mode)).andExpect(status().isBadRequest());
            mvc.perform(delete("/api/admin/customization/logo").param("mode", mode)).andExpect(status().isBadRequest());
            mvc.perform(multipart("/api/admin/customization/logo").file("file", new byte[] { 1 }).param("mode", mode))
                .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service, audit);
    }
}
