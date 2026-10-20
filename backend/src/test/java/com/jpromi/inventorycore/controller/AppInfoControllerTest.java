package com.jpromi.inventorycore.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.info.BuildProperties;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import com.jpromi.inventorycore.config.SecurityConfig;
import com.jpromi.inventorycore.ldap.LdapAuthenticationProvider;
import com.jpromi.inventorycore.oidc.DynamicClientRegistrationRepository;
import com.jpromi.inventorycore.oidc.OidcLoginHandler;
import com.jpromi.inventorycore.repository.AppUserRepository;

@WebMvcTest(AppInfoController.class)
@Import({SecurityConfig.class, AppInfoControllerTest.BuildInfo.class})
class AppInfoControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean AppUserRepository users;
    @MockitoBean TransactionTemplate transaction;
    @MockitoBean LdapAuthenticationProvider ldap;
    @MockitoBean DynamicClientRegistrationRepository registrations;
    @MockitoBean OidcLoginHandler oidc;

    @TestConfiguration
    static class BuildInfo {
        @Bean BuildProperties buildProperties() {
            Properties properties = new Properties();
            properties.setProperty("version", "2.3.4");
            return new BuildProperties(properties);
        }
    }

    @Test
    void anonymousCanReadVersionButNotProtectedApi() throws Exception {
        mvc.perform(get("/api/app-info")).andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("InventoryCore"))
            .andExpect(jsonPath("$.version").value("2.3.4"))
            .andExpect(jsonPath("$.githubUrl").value("https://github.com/JPromi/inventorycore"));
        mvc.perform(get("/api/assets")).andExpect(status().isUnauthorized());
    }

    @Test
    void directIdeRunsHaveDevelopmentFallback() {
        var provider = new StaticListableBeanFactory().getBeanProvider(BuildProperties.class);
        assertEquals("development", new AppInfoController(provider).get().version());
    }
}
