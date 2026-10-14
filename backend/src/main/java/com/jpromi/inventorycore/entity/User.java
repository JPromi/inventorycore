package com.jpromi.inventorycore.entity;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.Provider;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "app_users")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = true)
    private String password;

    @Column(nullable = false)
    @Builder.Default
    private String role = "USER";

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @Column(nullable = true)
    private String email;

    @Column(nullable = false)
    @Builder.Default
    private boolean authProviderOIDC = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean authProviderLOCAL = false;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Provider sourceProvider = Provider.LOCAL;

    /** Identifier at the source provider: the DN for LDAP, the subject for OIDC. */
    @Column(length = 1000)
    private String externalId;

    @ManyToMany
    @JoinTable(
        name = "user_groups",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "group_id")
    )
    @Builder.Default
    private Set<Group> groups = new HashSet<>();

    /** Admin by role or by membership in a group flagged as admin group. */
    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(role) || groups.stream().anyMatch(Group::isAdminGroup);
    }

    /** Role used for the session (ROLE_ADMIN / ROLE_USER). */
    public String effectiveRole() {
        return isAdmin() ? "ADMIN" : (role == null ? "USER" : role.toUpperCase());
    }

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}

