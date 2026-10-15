package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;

/**
 * LDAP settings for the admin UI. The bind password is write only: responses never contain it,
 * {@code bindPasswordSet} tells whether one is stored. An empty password in a request keeps the stored one.
 */
public record LdapSettingsDto(
    boolean enabled,
    String url,
    boolean ignoreCertificates,
    String bindDn,
    String bindPassword,
    boolean bindPasswordSet,
    String baseDn,
    String userSearchBase,
    String userFilter,
    String usernameAttribute,
    String displayNameAttribute,
    String emailAttribute,
    String groupSearchBase,
    String groupFilter,
    String groupNameAttribute,
    String groupMemberAttribute,
    boolean loginEnabled,
    boolean disableMissingUsers,
    OffsetDateTime lastSyncAt,
    String lastSyncResult,
    @com.fasterxml.jackson.annotation.JsonAlias("syncIntervalHours") Integer syncIntervalValue,
    com.jpromi.inventorycore.enums.LdapSyncIntervalUnit syncIntervalUnit
) {}
