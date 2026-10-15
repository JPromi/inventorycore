package com.jpromi.inventorycore.ldap;

import java.util.Set;

import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;

/**
 * Username/password login for users imported from LDAP: the password is checked by binding
 * with the user's DN. Other users are left to the next provider (local passwords).
 */
@Component
public class LdapAuthenticationProvider implements AuthenticationProvider {

    private final AppUserRepository userRepository;
    private final LdapService ldapService;

    public LdapAuthenticationProvider(AppUserRepository userRepository, LdapService ldapService) {
        this.userRepository = userRepository;
        this.ldapService = ldapService;
    }

    @Override
    @Transactional(readOnly = true)
    public Authentication authenticate(Authentication authentication) {
        String username = authentication.getName();
        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null || user.getSourceProvider() != Provider.LDAP) {
            // not ours: let the local password provider decide
            return null;
        }
        if (!user.isEnabled()) {
            throw new DisabledException("User disabled");
        }
        String password = authentication.getCredentials() == null ? "" : authentication.getCredentials().toString();
        boolean valid;
        try {
            valid = ldapService.authenticate(user, password);
        } catch (IllegalStateException exception) {
            throw new AuthenticationServiceException(exception.getMessage(), exception);
        }
        if (!valid) {
            throw new BadCredentialsException("Bad credentials");
        }
        return UsernamePasswordAuthenticationToken.authenticated(
            user.getUsername(),
            null,
            Set.of(new SimpleGrantedAuthority("ROLE_" + user.effectiveRole()))
        );
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }
}
