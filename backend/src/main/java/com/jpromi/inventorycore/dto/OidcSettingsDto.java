package com.jpromi.inventorycore.dto;

/**
 * OIDC settings for the admin UI. The client secret is write only: responses never contain it,
 * {@code clientSecretSet} tells whether one is stored. An empty secret in a request keeps the stored one.
 */
public record OidcSettingsDto(
    boolean enabled,
    String buttonLabel,
    String issuerUri,
    String clientId,
    String clientSecret,
    boolean clientSecretSet,
    String scopes,
    String usernameClaim,
    String displayNameClaim,
    String emailClaim,
    String groupsClaim,
    boolean autoCreateUsers,
    boolean syncGroups,
    boolean crossProviderLogin,
    boolean autoRedirect,
    String publicUrl,
    /** Read only: the redirect URI to register at the identity provider. */
    String redirectUri
) {}
