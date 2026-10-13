package com.jpromi.inventorycore.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AuthLoginRequest;
import com.jpromi.inventorycore.dto.AuthResponse;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;

    public AuthController(AuthenticationManager authenticationManager) {
        this.authenticationManager = authenticationManager;
    }

    @PostMapping
    public ResponseEntity<AuthResponse> login(@RequestBody AuthLoginRequest request) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
            );

            SecurityContextHolder.getContext().setAuthentication(authentication);

            String role = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .findFirst()
                .map(authority -> authority.replace("ROLE_", ""))
                .orElse("USER");

            return ResponseEntity.ok(AuthResponse.builder()
                .authenticated(true)
                .username(authentication.getName())
                .displayName(authentication.getName())
                .role(role)
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

        String role = authentication.getAuthorities().stream()
            .map(authority -> authority.getAuthority())
            .findFirst()
            .map(authority -> authority.replace("ROLE_", ""))
            .orElse("USER");

        return AuthResponse.builder()
            .authenticated(true)
            .username(authentication.getName())
            .displayName(authentication.getName())
            .role(role)
            .build();
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
