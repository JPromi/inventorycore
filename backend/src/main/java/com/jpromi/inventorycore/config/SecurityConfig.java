package com.jpromi.inventorycore.config;

import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.ldap.LdapAuthenticationProvider;
import com.jpromi.inventorycore.oidc.DynamicClientRegistrationRepository;
import com.jpromi.inventorycore.oidc.OidcLoginHandler;
import com.jpromi.inventorycore.repository.AppUserRepository;

@Configuration
public class SecurityConfig {

    /** LDAP users are checked against the directory first, everyone else against the local password. */
    @Bean
    public AuthenticationManager authenticationManager(
        LdapAuthenticationProvider ldapProvider,
        UserDetailsService userDetailsService,
        PasswordEncoder passwordEncoder
    ) {
        DaoAuthenticationProvider localProvider = new DaoAuthenticationProvider(userDetailsService);
        localProvider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(ldapProvider, localProvider);
    }

    @Bean
    SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        DynamicClientRegistrationRepository clientRegistrations,
        OidcLoginHandler oidcLoginHandler
    ) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/",
                    "/error",
                    "/login",
                    "/api/health",
                    "/api/auth",
                    "/api/auth/me",
                    "/api/auth/providers",
                    "/oauth2/**",
                    "/login/oauth2/**"
                ).permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/customization", "/api/customization/logo").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            // the SPA handles logins itself: unauthenticated API calls get 401, no redirect
            .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .oauth2Login(oauth -> oauth
                .clientRegistrationRepository(clientRegistrations)
                .loginPage("/login")
                .successHandler(oidcLoginHandler)
                .failureHandler(oidcLoginHandler));

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(
            "http://localhost:4200",
            "http://127.0.0.1:4200",
            "http://localhost:8080"
        ));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    /** Local accounts only; LDAP and OIDC users have no local password. */
    @Bean
    public UserDetailsService userDetailsService(AppUserRepository userRepository, TransactionTemplate transaction) {
        // inside a transaction, because the admin role depends on the (lazy) groups
        return username -> transaction.execute(status -> {
            com.jpromi.inventorycore.entity.User appUser = userRepository.findByUsername(username)
                .filter(user -> user.getSourceProvider() == Provider.LOCAL)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

            return org.springframework.security.core.userdetails.User.withUsername(appUser.getUsername())
                .password(appUser.getPassword() == null ? "" : appUser.getPassword())
                .authorities(Set.of(new SimpleGrantedAuthority("ROLE_" + appUser.effectiveRole())))
                .disabled(!appUser.isEnabled())
                .build();
        });
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
