package com.jpromi.inventorycore.oidc;

import java.util.Arrays;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.stereotype.Component;

import com.jpromi.inventorycore.entity.OidcSettings;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;

/**
 * Builds the OIDC client registration from the settings in the database, so the provider can be
 * changed in the admin UI without a restart. The discovery document is fetched once and cached
 * until the settings change.
 */
@Component
public class DynamicClientRegistrationRepository implements ClientRegistrationRepository {

    public static final String REGISTRATION_ID = "oidc";

    private static final Logger log = LoggerFactory.getLogger(DynamicClientRegistrationRepository.class);

    private final OidcSettingsRepository settingsRepository;
    private volatile Cached cached;

    private record Cached(String key, ClientRegistration registration) {}

    public DynamicClientRegistrationRepository(OidcSettingsRepository settingsRepository) {
        this.settingsRepository = settingsRepository;
    }

    @Override
    public ClientRegistration findByRegistrationId(String registrationId) {
        if (!REGISTRATION_ID.equals(registrationId)) {
            return null;
        }
        OidcSettings settings = settingsRepository.load();
        if (!settings.isEnabled() || isBlank(settings.getIssuerUri()) || isBlank(settings.getClientId())) {
            return null;
        }
        String key = String.join("|",
            settings.getIssuerUri(), settings.getClientId(), Objects.toString(settings.getClientSecret(), ""),
            Objects.toString(settings.getScopes(), ""), Objects.toString(settings.getPublicUrl(), ""));
        Cached current = cached;
        if (current != null && current.key().equals(key)) {
            return current.registration();
        }
        try {
            ClientRegistration registration = build(settings);
            cached = new Cached(key, registration);
            return registration;
        } catch (RuntimeException exception) {
            log.warn("OIDC discovery for {} failed: {}", settings.getIssuerUri(), exception.getMessage());
            return null;
        }
    }

    /** Fetches the discovery document; throws when the issuer is not reachable or invalid. */
    public ClientRegistration build(OidcSettings settings) {
        String[] scopes = Arrays.stream(Objects.toString(settings.getScopes(), "openid").split("[\\s,]+"))
            .filter(scope -> !scope.isBlank())
            .toArray(String[]::new);
        return ClientRegistrations.fromIssuerLocation(settings.getIssuerUri())
            .registrationId(REGISTRATION_ID)
            .clientId(settings.getClientId())
            .clientSecret(settings.getClientSecret())
            .scope(scopes)
            .redirectUri(redirectUriTemplate(settings))
            .userNameAttributeName("sub")
            .build();
    }

    /** The redirect URI that has to be registered at the identity provider. */
    public static String redirectUriTemplate(OidcSettings settings) {
        String base = isBlank(settings.getPublicUrl()) ? "{baseUrl}" : settings.getPublicUrl().replaceAll("/+$", "");
        return base + "/login/oauth2/code/{registrationId}";
    }

    public void invalidate() {
        cached = null;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
