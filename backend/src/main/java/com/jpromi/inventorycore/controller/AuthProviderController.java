package com.jpromi.inventorycore.controller;

import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.dto.LdapSettingsDto;
import com.jpromi.inventorycore.dto.OidcSettingsDto;
import com.jpromi.inventorycore.entity.LdapSettings;
import com.jpromi.inventorycore.entity.OidcSettings;
import com.jpromi.inventorycore.ldap.LdapService;
import com.jpromi.inventorycore.oidc.DynamicClientRegistrationRepository;
import com.jpromi.inventorycore.repository.LdapSettingsRepository;
import com.jpromi.inventorycore.repository.OidcSettingsRepository;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.service.AuditService;

/** Configuration of the external identity providers (admin only via /api/admin/**). */
@RestController
@RequestMapping("/api/admin")
public class AuthProviderController {

    public record OidcTestResult(boolean success, String message, String issuer, String authorizationEndpoint) {}

    private final LdapSettingsRepository ldapRepository;
    private final OidcSettingsRepository oidcRepository;
    private final LdapService ldapService;
    private final DynamicClientRegistrationRepository clientRegistrations;
    private final AuditService audit;

    public AuthProviderController(
        LdapSettingsRepository ldapRepository,
        OidcSettingsRepository oidcRepository,
        LdapService ldapService,
        DynamicClientRegistrationRepository clientRegistrations,
        AuditService audit
    ) {
        this.ldapRepository = ldapRepository;
        this.oidcRepository = oidcRepository;
        this.ldapService = ldapService;
        this.clientRegistrations = clientRegistrations;
        this.audit = audit;
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
        LdapSettingsDto before = toDto(settings);
        apply(settings, request);
        LdapSettingsDto after = toDto(ldapRepository.save(settings));
        java.util.List<AuditDetail> changes = new java.util.ArrayList<>(audit.diff(before, after));
        if (request.bindPassword() != null && !request.bindPassword().isBlank()) {
            changes.add(AuditDetail.event("BIND_PASSWORD_CHANGED"));
        }
        if (!changes.isEmpty()) {
            audit.log(AuditAction.UPDATE, AuditObjectType.SETTINGS, null, "LDAP", changes);
        }
        return after;
    }

    /** Tests the values from the form, even if they are not saved yet. */
    @PostMapping("/ldap/test")
    public LdapService.TestResult testLdap(@RequestBody LdapSettingsDto request) {
        LdapSettings settings = new LdapSettings();
        LdapSettings stored = ldapRepository.load();
        settings.setBindPassword(stored.getBindPassword());
        apply(settings, request);
        // the stored password only goes to the stored server and account; for another server or bind DN
        // it must be typed in again (otherwise a test against a foreign server would reveal it)
        boolean storedPassword = java.util.Objects.equals(settings.getBindPassword(), stored.getBindPassword());
        if (storedPassword && (!java.util.Objects.equals(settings.getUrl(), stored.getUrl())
            || !java.util.Objects.equals(settings.getBindDn(), stored.getBindDn()))) {
            settings.setBindPassword(null);
        }
        return ldapService.test(settings);
    }

    @PostMapping("/ldap/sync")
    public LdapService.SyncResult syncLdap() {
        LdapService.SyncResult result = ldapService.sync();
        audit.log(AuditAction.SYNC, AuditObjectType.SETTINGS, null, "LDAP", AuditDetail.event("LDAP_SYNC",
            "success", result.success(),
            "usersCreated", result.usersCreated(),
            "usersUpdated", result.usersUpdated(),
            "usersDisabled", result.usersDisabled(),
            "usersSkipped", result.usersSkipped(),
            "groupsCreated", result.groupsCreated(),
            "groupsUpdated", result.groupsUpdated(),
            "groupsDeleted", result.groupsDeleted(),
            // the error text comes from the directory server / Java and is passed on as is
            "error", result.success() ? null : result.message()));
        return result;
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
        OidcSettingsDto before = toDto(settings);
        apply(settings, request);
        OidcSettings saved = oidcRepository.save(settings);
        java.util.List<AuditDetail> changes = new java.util.ArrayList<>(audit.diff(before, toDto(saved)));
        if (request.clientSecret() != null && !request.clientSecret().isBlank()) {
            changes.add(AuditDetail.event("CLIENT_SECRET_CHANGED"));
        }
        if (!changes.isEmpty()) {
            audit.log(AuditAction.UPDATE, AuditObjectType.SETTINGS, null, "OIDC", changes);
        }
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
        var unit = request.syncIntervalUnit() == null
            ? com.jpromi.inventorycore.enums.LdapSyncIntervalUnit.HOURS : request.syncIntervalUnit();
        int interval = request.syncIntervalValue() == null ? 6 : request.syncIntervalValue();
        if (interval < 1 || interval > unit.maxValue()) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                "Das Sync-Intervall muss mindestens eine Einheit und maximal 365 Tage betragen.");
        }
        settings.setSyncIntervalValue(interval);
        settings.setSyncIntervalUnit(unit);
        // Legacy group selections are folded into the editable filter returned by toDto.
        settings.setRestrictGroups(false);
        settings.getSelectedGroupNames().clear();
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
            settings.effectiveGroupFilter(),
            settings.getGroupNameAttribute(),
            settings.getGroupMemberAttribute(),
            settings.isLoginEnabled(),
            settings.isDisableMissingUsers(),
            settings.getLastSyncAt(),
            settings.getLastSyncResult(),
            settings.getSyncIntervalValue(),
            settings.getSyncIntervalUnit()
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
