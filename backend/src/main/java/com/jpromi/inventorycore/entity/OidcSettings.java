package com.jpromi.inventorycore.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** OpenID Connect login, edited in the admin UI. There is only one row (id 1). */
@Getter
@Setter
@Entity
@Table(name = "oidc_settings")
@NoArgsConstructor
public class OidcSettings {

    public static final long SINGLETON_ID = 1L;

    @Id
    private Long id = SINGLETON_ID;

    @Column(nullable = false)
    private boolean enabled = false;

    /** Text of the login button, e.g. "Microsoft" or "Keycloak". */
    private String buttonLabel = "SSO";

    /** e.g. https://login.microsoftonline.com/{tenant}/v2.0 or https://keycloak/realms/{realm} */
    private String issuerUri;

    private String clientId;

    private String clientSecret;

    private String scopes = "openid profile email";

    private String usernameClaim = "preferred_username";

    private String displayNameClaim = "name";

    private String emailClaim = "email";

    private String groupsClaim = "groups";

    /** Unknown users are created on their first login. */
    @Column(nullable = false)
    private boolean autoCreateUsers = true;

    /** Groups from the groups claim are created and assigned (only for users that came from OIDC). */
    @Column(nullable = false)
    private boolean syncGroups = true;

    /** Users imported from another provider (LDAP) may log in via OIDC. Local users never can. */
    @Column(nullable = false)
    private boolean crossProviderLogin = false;

    /**
     * The login page goes straight to the identity provider (like Nextcloud). {@code /login?direct=1}
     * still shows the normal login page, e.g. for local admins.
     */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean autoRedirect = false;

    /**
     * Public address of the frontend, e.g. https://inventar.example.com. Used for the redirect URI
     * and the redirect after login. Empty = derived from the request.
     */
    private String publicUrl;
}
