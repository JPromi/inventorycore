package com.jpromi.inventorycore.controller;

import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.LdapSettingsDto;
import com.jpromi.inventorycore.dto.OidcSettingsDto;
import com.jpromi.inventorycore.entity.LdapSettings;
import com.jpromi.inventorycore.entity.OidcSettings;
import com.jpromi.inventorycore.ldap.LdapService;
import com.jpromi.inventorycore.oidc.DynamicClientRegistrationRepository;
import com.jpromi.inventorycore.repository.LdapSettingsRepository;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;

/** Configuration of the external identity providers (admin only via /api/admin/**). */
@RestController
@RequestMapping("/api/admin")
public class AuthProviderController {

    public record OidcTestResult(boolean success, String message, String issuer, String authorizationEndpoint) {}

    private final LdapSettingsRepository ldapRepository;
    private final OidcSettingsRepository oidcRepository;
    private final LdapService ldapService;
    private final DynamicClientRegistrationRepository clientRegistrations;

    public AuthProviderController(
        LdapSettingsRepository ldapRepository,
        OidcSettingsRepository oidcRepository,
        LdapService ldapService,
        DynamicClientRegistrationRepository clientRegistrations
    ) {
        this.ldapRepository = ldapRepository;
        this.oidcRepository = oidcRepository;
        this.ldapService = ldapService;
        this.clientRegistrations = clientRegistrations;
    }

    // ---- LDAP ----

    @GetMapping("/ldap")
    public LdapSettingsDto ldap() {
        return toDto(ldapRepository.load());
    }

    @PutMapping("/ldap")
    @Transactional
    public LdapSettingsDto saveLdap(@RequestBody LdapSettingsDto request) {
        LdapSettings settings = ldapRepository.load();
        apply(settings, request);
        return toDto(ldapRepository.save(settings));
    }

    /** Tests the values from the form, even if they are not saved yet. */
    @PostMapping("/ldap/test")
    public LdapService.TestResult testLdap(@RequestBody LdapSettingsDto request) {
        LdapSettings settings = new LdapSettings();
        LdapSettings stored = ldapRepository.load();
        settings.setBindPassword(stored.getBindPassword());
        apply(settings, request);
        return ldapService.test(settings);
    }

    @PostMapping("/ldap/sync")
    public LdapService.SyncResult syncLdap() {
        return ldapService.sync();
    }

    // ---- OIDC ----

    @GetMapping("/oidc")
    public OidcSettingsDto oidc() {
        return toDto(oidcRepository.load());
    }

    @PutMapping("/oidc")
    @Transactional
    public OidcSettingsDto saveOidc(@RequestBody OidcSettingsDto request) {
        OidcSettings settings = oidcRepository.load();
        apply(settings, request);
        OidcSettings saved = oidcRepository.save(settings);
        clientRegistrations.invalidate();
        return toDto(saved);
    }

    /** Fetches the discovery document of the issuer from the form values. */
    @PostMapping("/oidc/test")
    public OidcTestResult testOidc(@RequestBody OidcSettingsDto request) {
        OidcSettings settings = new OidcSettings();
        settings.setClientSecret(oidcRepository.load().getClientSecret());
        apply(settings, request);
        if (isBlank(settings.getIssuerUri()) || isBlank(settings.getClientId())) {
            return new OidcTestResult(false, "Bitte Issuer-URL und Client-ID angeben.", null, null);
        }
        try {
            ClientRegistration registration = clientRegistrations.build(settings);
            return new OidcTestResult(
                true,
                "Discovery erfolgreich. Ob Client-ID und Secret stimmen, zeigt erst ein Login.",
                registration.getProviderDetails().getIssuerUri(),
                registration.getProviderDetails().getAuthorizationUri()
            );
        } catch (RuntimeException exception) {
            return new OidcTestResult(false, "Issuer nicht erreichbar oder ungültig: " + exception.getMessage(), null, null);
        }
    }

    // ---- mapping ----

    private static void apply(LdapSettings settings, LdapSettingsDto request) {
        settings.setEnabled(request.enabled());
        settings.setUrl(trim(request.url()));
        settings.setIgnoreCertificates(request.ignoreCertificates());
        settings.setBindDn(trim(request.bindDn()));
        if (!isBlank(request.bindPassword())) {
            settings.setBindPassword(request.bindPassword());
        }
        settings.setBaseDn(trim(request.baseDn()));
        settings.setUserSearchBase(trim(request.userSearchBase()));
        settings.setUserFilter(trim(request.userFilter()));
        settings.setUsernameAttribute(trim(request.usernameAttribute()));
        settings.setDisplayNameAttribute(trim(request.displayNameAttribute()));
        settings.setEmailAttribute(trim(request.emailAttribute()));
        settings.setGroupSearchBase(trim(request.groupSearchBase()));
        settings.setGroupFilter(trim(request.groupFilter()));
        settings.setGroupNameAttribute(trim(request.groupNameAttribute()));
        settings.setGroupMemberAttribute(trim(request.groupMemberAttribute()));
        settings.setLoginEnabled(request.loginEnabled());
        settings.setDisableMissingUsers(request.disableMissingUsers());
    }

    private static LdapSettingsDto toDto(LdapSettings settings) {
        return new LdapSettingsDto(
            settings.isEnabled(),
            settings.getUrl(),
            settings.isIgnoreCertificates(),
            settings.getBindDn(),
            null,
            !isBlank(settings.getBindPassword()),
            settings.getBaseDn(),
            settings.getUserSearchBase(),
            settings.getUserFilter(),
            settings.getUsernameAttribute(),
            settings.getDisplayNameAttribute(),
            settings.getEmailAttribute(),
            settings.getGroupSearchBase(),
            settings.getGroupFilter(),
            settings.getGroupNameAttribute(),
            settings.getGroupMemberAttribute(),
            settings.isLoginEnabled(),
            settings.isDisableMissingUsers(),
            settings.getLastSyncAt(),
            settings.getLastSyncResult()
        );
    }

    private static void apply(OidcSettings settings, OidcSettingsDto request) {
        settings.setEnabled(request.enabled());
        settings.setButtonLabel(trim(request.buttonLabel()));
        settings.setIssuerUri(trim(request.issuerUri()));
        settings.setClientId(trim(request.clientId()));
        if (!isBlank(request.clientSecret())) {
            settings.setClientSecret(request.clientSecret());
        }
        settings.setScopes(trim(request.scopes()));
        settings.setUsernameClaim(trim(request.usernameClaim()));
        settings.setDisplayNameClaim(trim(request.displayNameClaim()));
        settings.setEmailClaim(trim(request.emailClaim()));
        settings.setGroupsClaim(trim(request.groupsClaim()));
        settings.setAutoCreateUsers(request.autoCreateUsers());
        settings.setSyncGroups(request.syncGroups());
        settings.setCrossProviderLogin(request.crossProviderLogin());
        settings.setPublicUrl(trim(request.publicUrl()));
    }

    private static OidcSettingsDto toDto(OidcSettings settings) {
        return new OidcSettingsDto(
            settings.isEnabled(),
            settings.getButtonLabel(),
            settings.getIssuerUri(),
            settings.getClientId(),
            null,
            !isBlank(settings.getClientSecret()),
            settings.getScopes(),
            settings.getUsernameClaim(),
            settings.getDisplayNameClaim(),
            settings.getEmailClaim(),
            settings.getGroupsClaim(),
            settings.isAutoCreateUsers(),
            settings.isSyncGroups(),
            settings.isCrossProviderLogin(),
            settings.getPublicUrl(),
            DynamicClientRegistrationRepository.redirectUriTemplate(settings).replace("{registrationId}", DynamicClientRegistrationRepository.REGISTRATION_ID)
        );
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
