package com.jpromi.inventorycore.controller;

import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AuthLoginRequest;
import com.jpromi.inventorycore.dto.AuthResponse;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.entity.OidcSettings;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;
import com.jpromi.inventorycore.service.ApiMapper;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final AppUserRepository userRepository;
    private final ApiMapper mapper;
    private final OidcSettingsRepository oidcSettingsRepository;
    private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(
        AuthenticationManager authenticationManager,
        AppUserRepository userRepository,
        ApiMapper mapper,
        OidcSettingsRepository oidcSettingsRepository
    ) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.mapper = mapper;
        this.oidcSettingsRepository = oidcSettingsRepository;
    }

    /** Login options for the login page (public). */
    public record LoginProviders(boolean oidcEnabled, String oidcLabel, String oidcLoginUrl) {}

    @GetMapping("/providers")
    public LoginProviders providers() {
        OidcSettings oidc = oidcSettingsRepository.load();
        boolean enabled = oidc.isEnabled() && oidc.getIssuerUri() != null && oidc.getClientId() != null;
        return new LoginProviders(enabled, oidc.getButtonLabel() == null ? "SSO" : oidc.getButtonLabel(), "/oauth2/authorization/oidc");
    }

    @PostMapping
    public ResponseEntity<AuthResponse> login(
        @RequestBody AuthLoginRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
            );

            // new session id after the login, so an id planted before the login is worthless (session fixation)
            if (httpRequest.getSession(false) != null) {
                httpRequest.changeSessionId();
            }
            SecurityContext securityContext = SecurityContextHolder.createEmptyContext();
            securityContext.setAuthentication(authentication);
            SecurityContextHolder.setContext(securityContext);
            securityContextRepository.saveContext(securityContext, httpRequest, httpResponse);

            String role = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .findFirst()
                .map(authority -> authority.replace("ROLE_", ""))
                .orElse("USER");
            User user = resolveUser(authentication);

            return ResponseEntity.ok(AuthResponse.builder()
                .authenticated(true)
                .username(authentication.getName())
                .uuid(user.getUuid())
                .displayName(user.getDisplayName())
                .sourceProvider(user.getSourceProvider())
                .profileImageUrl(user.profileImageLocation())
                .role(role)
                .permissions(user.getGroups().stream()
                    .flatMap(group -> group.getPermissions().stream())
                    .map(mapper::toResponse)
                    .collect(Collectors.toSet()))
                .build());
        } catch (BadCredentialsException exception) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(AuthResponse.builder()
                .authenticated(false)
                .username(null)
                .displayName(null)
                .role(null)
                .message("Invalid credentials")
                .build());
        }
    }

    @GetMapping("/me")
    public AuthResponse me(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken) {
            return AuthResponse.builder()
                .authenticated(false)
                .username(null)
                .displayName(null)
                .role(null)
                .build();
        }

        User user = resolveUser(authentication);

        return AuthResponse.builder()
            .authenticated(true)
            .username(user.getUsername())
            .uuid(user.getUuid())
            .displayName(user.getDisplayName())
            .sourceProvider(user.getSourceProvider())
            .profileImageUrl(user.profileImageLocation())
            .role(user.effectiveRole())
            .permissions(user.getGroups().stream()
                .flatMap(group -> group.getPermissions().stream())
                .map(mapper::toResponse)
                .collect(Collectors.toSet()))
            .build();
    }

    private User resolveUser(Authentication authentication) {
        String username = authentication.getName();
        return userRepository.findByUsername(username)
            .orElseGet(() -> User.builder()
                .username(username)
                .displayName(username)
                .role(resolveRole(authentication))
                .build());
    }

    private String resolveRole(Authentication authentication) {
        return authentication.getAuthorities().stream()
            .map(authority -> authority.getAuthority())
            .findFirst()
            .map(authority -> authority.replace("ROLE_", ""))
            .orElse("USER");
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null) {
            new SecurityContextLogoutHandler().logout(request, response, authentication);
        }

        SecurityContextHolder.clearContext();
        return ResponseEntity.ok().build();
    }
}

