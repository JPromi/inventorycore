package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** LDAP / Active Directory connection, edited in the admin UI. There is only one row (id 1). */
@Getter
@Setter
@Entity
@Table(name = "ldap_settings")
@NoArgsConstructor
public class LdapSettings {

    public static final long SINGLETON_ID = 1L;

    @Id
    private Long id = SINGLETON_ID;

    @Column(nullable = false)
    private boolean enabled = false;

    /** e.g. ldap://dc01.example.local:389 or ldaps://dc01.example.local:636 */
    private String url;

    /** Accept any TLS certificate (self signed, wrong host name). Only for ldaps://. */
    @Column(nullable = false)
    private boolean ignoreCertificates = false;

    private String bindDn;

    private String bindPassword;

    private String baseDn;

    /** Where users are searched; empty = base DN. */
    private String userSearchBase;

    @Column(length = 2000)
    private String userFilter = "(&(objectClass=user)(objectCategory=person))";

    private String usernameAttribute = "sAMAccountName";

    private String displayNameAttribute = "displayName";

    private String emailAttribute = "mail";

    /** Where groups are searched; empty = base DN. */
    private String groupSearchBase;

    @Column(length = 2000)
    private String groupFilter = "(objectClass=group)";

    private String groupNameAttribute = "cn";

    /** Attribute on the group listing its members (DNs for "member", user names for "memberUid"). */
    private String groupMemberAttribute = "member";

    /** Users imported from LDAP may log in with their LDAP password. */
    @Column(nullable = false)
    private boolean loginEnabled = true;

    /** Users no longer found in LDAP are disabled during sync. */
    @Column(nullable = false)
    private boolean disableMissingUsers = true;

    // Preserve existing values in the original column; their unit defaults to HOURS.
    @Column(name = "sync_interval_hours", nullable = false, columnDefinition = "integer default 6")
    private int syncIntervalValue = 6;

    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(16) default 'HOURS'")
    private com.jpromi.inventorycore.enums.LdapSyncIntervalUnit syncIntervalUnit =
        com.jpromi.inventorycore.enums.LdapSyncIntervalUnit.HOURS;

    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean restrictGroups = false;

    @jakarta.persistence.ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @jakarta.persistence.CollectionTable(name = "ldap_selected_groups", joinColumns = @jakarta.persistence.JoinColumn(name = "settings_id"))
    @Column(name = "group_name", length = 1000)
    private java.util.Set<String> selectedGroupNames = new java.util.LinkedHashSet<>();

    public String effectiveGroupFilter() {
        if (!restrictGroups) {
            return groupFilter;
        }
        if (selectedGroupNames.isEmpty()) {
            return "(!(objectClass=*))";
        }
        String attribute = groupNameAttribute;
        if (attribute == null || !attribute.matches("[a-zA-Z][a-zA-Z0-9-]*")) {
            throw new IllegalArgumentException("Ungueltiges Attribut fuer Gruppennamen.");
        }
        String choices = selectedGroupNames.stream().sorted()
            .map(name -> "(" + attribute + "=" + org.springframework.ldap.support.LdapEncoder.filterEncode(name) + ")")
            .collect(java.util.stream.Collectors.joining());
        return "(&" + groupFilter + "(|" + choices + "))";
    }

    private OffsetDateTime lastSyncAt;

    @Column(length = 2000)
    private String lastSyncResult;
}
