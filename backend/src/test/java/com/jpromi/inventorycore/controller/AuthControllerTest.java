package com.jpromi.inventorycore.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import com.jpromi.inventorycore.dto.AuthLoginRequest;
import com.jpromi.inventorycore.entity.OidcSettings;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.LoginAuditService;

class AuthControllerTest {

    private final AuthenticationManager authenticationManager = mock(AuthenticationManager.class);
    private final AppUserRepository users = mock(AppUserRepository.class);
    private final OidcSettingsRepository oidc = mock(OidcSettingsRepository.class);
    private final LoginAuditService loginAudit = mock(LoginAuditService.class);
    private final AuthController controller = new AuthController(authenticationManager, users, new ApiMapper(), oidc, loginAudit);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private static OidcSettings configured(boolean enabled, boolean autoRedirect) {
        var settings = new OidcSettings();
        settings.setEnabled(enabled);
        settings.setIssuerUri("https://sso.example.org/realms/feuerwehr");
        settings.setClientId("inventorycore");
        settings.setAutoRedirect(autoRedirect);
        return settings;
    }

    private static AuthLoginRequest credentials(String username, String password) {
        var request = new AuthLoginRequest();
        request.setUsername(username);
        request.setPassword(password);
        return request;
    }

    @Test
    void autoRedirectIsOfferedOnlyForAWorkingOidcLogin() {
        when(oidc.load()).thenReturn(configured(true, true));
        assertTrue(controller.providers().oidcAutoRedirect());
        when(oidc.load()).thenReturn(configured(true, false));
        assertFalse(controller.providers().oidcAutoRedirect());
        // switched off or incomplete: the login page must stay usable
        when(oidc.load()).thenReturn(configured(false, true));
        assertFalse(controller.providers().oidcAutoRedirect());
        var incomplete = configured(true, true);
        incomplete.setClientId(null);
        when(oidc.load()).thenReturn(incomplete);
        assertFalse(controller.providers().oidcAutoRedirect());
    }

    @Test
    void aSuccessfulSignInIsLoggedWithItsWayOfSigningIn() {
        User user = User.builder().username("gerätewart").displayName("Gerätewart").sourceProvider(Provider.LDAP).role("USER").build();
        when(users.findByUsername("gerätewart")).thenReturn(Optional.of(user));
        when(authenticationManager.authenticate(any())).thenReturn(UsernamePasswordAuthenticationToken.authenticated(
            "gerätewart", null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        var request = new MockHttpServletRequest();

        var response = controller.login(credentials("gerätewart", "geheim"), request, new MockHttpServletResponse());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(loginAudit).signedIn(user, LoginAuditService.Method.LDAP, request);
        verify(loginAudit, never()).failed(any(), any(), any(), any());
    }

    @Test
    void failedSignInsAreLoggedWithTheReasonButAnsweredAlike() {
        var request = new MockHttpServletRequest();
        doThrow(new BadCredentialsException("bad")).when(authenticationManager).authenticate(any());
        var wrongPassword = controller.login(credentials("inv", "falsch"), request, new MockHttpServletResponse());
        doThrow(new DisabledException("disabled")).when(authenticationManager).authenticate(any());
        var disabled = controller.login(credentials("ehemalig", "geheim"), request, new MockHttpServletResponse());

        verify(loginAudit).failed("inv", null, "BAD_CREDENTIALS", request);
        verify(loginAudit).failed("ehemalig", null, "DISABLED", request);
        assertEquals(HttpStatus.UNAUTHORIZED, wrongPassword.getStatusCode());
        assertEquals(wrongPassword.getBody().getMessage(), disabled.getBody().getMessage());
    }

    @Test
    void aSignOutIsLoggedForTheSignedInUser() {
        User user = User.builder().username("inv").displayName("Admin").build();
        when(users.findByUsername("inv")).thenReturn(Optional.of(user));
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
            "inv", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        var request = new MockHttpServletRequest();

        controller.logout(request, new MockHttpServletResponse());

        verify(loginAudit).signedOut(user, request);
    }
}
