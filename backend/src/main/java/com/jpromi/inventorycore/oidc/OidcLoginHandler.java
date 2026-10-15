package com.jpromi.inventorycore.oidc;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.OidcSettings;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;

/**
 * Turns a successful OIDC login into an app session.
 *
 * <p>Rules:
 * <ul>
 *   <li>Local users can never log in via OIDC.</li>
 *   <li>Users imported from another provider (LDAP) only with "cross provider login".</li>
 *   <li>Unknown users are created only with "auto create users".</li>
 *   <li>Groups from the groups claim are created and assigned for users that came from OIDC.</li>
 * </ul>
 * The session then holds a normal username token, so the rest of the app does not care how the user logged in.
 */
@Component
public class OidcLoginHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

    private static final Logger log = LoggerFactory.getLogger(OidcLoginHandler.class);

    private final OidcSettingsRepository settingsRepository;
    private final AppUserRepository userRepository;
    private final GroupRepository groupRepository;
    private final TransactionTemplate transaction;
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    /** Reason for a rejected login, shown on the login page via ?error=... */
    private static final class Rejected extends RuntimeException {
        private final String code;

        Rejected(String code) {
            super(code);
            this.code = code;
        }
    }

    public OidcLoginHandler(
        OidcSettingsRepository settingsRepository,
        AppUserRepository userRepository,
        GroupRepository groupRepository,
        TransactionTemplate transaction
    ) {
        this.settingsRepository = settingsRepository;
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
        this.transaction = transaction;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication) throws IOException {
        OidcSettings settings = settingsRepository.load();
        if (!(authentication.getPrincipal() instanceof OAuth2User oauthUser)) {
            reject(request, response, settings, "oidc_failed");
            return;
        }
        Map<String, Object> claims = new HashMap<>(oauthUser.getAttributes());
        if (oauthUser instanceof OidcUser oidcUser) {
            claims.putAll(oidcUser.getClaims());
        }

        try {
            // the role needs the user's groups, so it is read inside the transaction
            String[] login = transaction.execute(status -> {
                User user = resolveUser(settings, claims);
                return new String[] { user.getUsername(), user.effectiveRole() };
            });
            Authentication session = UsernamePasswordAuthenticationToken.authenticated(
                login[0], null, Set.of(new SimpleGrantedAuthority("ROLE_" + login[1])));
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(session);
            SecurityContextHolder.setContext(context);
            contextRepository.saveContext(context, request, response);
            response.sendRedirect(frontendUrl(settings, "/"));
        } catch (Rejected rejected) {
            reject(request, response, settings, rejected.code);
        }
    }

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception) throws IOException {
        log.warn("OIDC login failed: {}", exception.getMessage());
        reject(request, response, settingsRepository.load(), "oidc_failed");
    }

    private User resolveUser(OidcSettings settings, Map<String, Object> claims) {
        String username = firstNonBlank(claim(claims, settings.getUsernameClaim()), claim(claims, "preferred_username"), claim(claims, "email"));
        if (username == null) {
            throw new Rejected("oidc_no_username");
        }
        String subject = claim(claims, "sub");
        User user = userRepository.findByUsername(username)
            .or(() -> userRepository.findAll().stream().filter(entry -> entry.getUsername().equalsIgnoreCase(username)).findFirst())
            .orElse(null);

        if (user == null) {
            if (!settings.isAutoCreateUsers()) {
                throw new Rejected("oidc_unknown_user");
            }
            user = User.builder()
                .username(username)
                .displayName(firstNonBlank(claim(claims, settings.getDisplayNameClaim()), username))
                .email(claim(claims, settings.getEmailClaim()))
                .role("USER")
                .enabled(true)
                .sourceProvider(Provider.OIDC)
                .externalId(subject)
                .build();
        } else if (user.getSourceProvider() == Provider.LOCAL) {
            throw new Rejected("oidc_local_user");
        } else if (user.getSourceProvider() != Provider.OIDC && !settings.isCrossProviderLogin()) {
            throw new Rejected("oidc_provider_mismatch");
        }
        if (!user.isEnabled()) {
            throw new Rejected("oidc_disabled_user");
        }

        if (user.getSourceProvider() == Provider.OIDC) {
            // profile data of OIDC users follows the identity provider
            user.setDisplayName(firstNonBlank(claim(claims, settings.getDisplayNameClaim()), user.getDisplayName(), username));
            String email = claim(claims, settings.getEmailClaim());
            if (email != null) {
                user.setEmail(email);
            }
            user.setExternalId(subject);
            String picture = claim(claims, "picture");
            user.setProfileImageUrl(picture != null && picture.startsWith("https://") ? picture : null);
            if (settings.isSyncGroups()) {
                assignGroups(user, groupNames(claims.get(settings.getGroupsClaim())));
            }
        }
        return userRepository.save(user);
    }

    /** Creates missing OIDC groups and replaces the user's OIDC groups; local groups stay. */
    private void assignGroups(User user, Set<String> names) {
        Map<String, Group> existing = new HashMap<>();
        for (Group group : groupRepository.findAll()) {
            if (group.getSourceProvider() == Provider.OIDC && group.getName() != null) {
                existing.put(group.getName().toLowerCase(Locale.ROOT), group);
            }
        }
        Set<Group> groups = new LinkedHashSet<>();
        for (String name : names) {
            Group group = existing.get(name.toLowerCase(Locale.ROOT));
            if (group == null) {
                group = groupRepository.save(Group.builder().name(name).sourceProvider(Provider.OIDC).externalId(name).build());
            }
            groups.add(group);
        }
        user.getGroups().removeIf(group -> group.getSourceProvider() == Provider.OIDC);
        user.getGroups().addAll(groups);
    }

    private static Set<String> groupNames(Object value) {
        Set<String> names = new LinkedHashSet<>();
        if (value instanceof Collection<?> collection) {
            collection.stream().filter(entry -> entry != null && !entry.toString().isBlank()).forEach(entry -> names.add(entry.toString()));
        } else if (value instanceof String text) {
            for (String part : text.split("[,\\s]+")) {
                if (!part.isBlank()) {
                    names.add(part);
                }
            }
        }
        return names;
    }

    private void reject(HttpServletRequest request, HttpServletResponse response, OidcSettings settings, String code) throws IOException {
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        response.sendRedirect(frontendUrl(settings, "/login?error=" + URLEncoder.encode(code, StandardCharsets.UTF_8)));
    }

    private static String frontendUrl(OidcSettings settings, String path) {
        String base = settings.getPublicUrl() == null ? "" : settings.getPublicUrl().replaceAll("/+$", "");
        return base + path;
    }

    private static String claim(Map<String, Object> claims, String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        Object value = claims.get(name);
        if (value instanceof List<?> list && !list.isEmpty()) {
            value = list.get(0);
        }
        return value == null || value.toString().isBlank() ? null : value.toString();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
