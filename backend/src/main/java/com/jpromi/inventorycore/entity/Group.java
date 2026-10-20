package com.jpromi.inventorycore.entity;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.Provider;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.OneToMany;
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
@Table(name = "app_groups")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class Group {
    @Id 
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @Column(nullable = true)
    private String name;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Provider sourceProvider = Provider.LOCAL;

    /** Identifier at the source provider: the DN for LDAP, the claim value for OIDC. */
    @Column(length = 1000)
    private String externalId;

    /** Members of an admin group get full access, like users with the ADMIN role. */
    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean adminGroup = false;

    /**
     * The built-in group "Alle Benutzer": every user belongs to it without being added, so its
     * permissions apply to everyone. There is exactly one; it cannot be renamed, deleted, given
     * members or made an admin group.
     */
    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean everyone = false;

    @ManyToMany(mappedBy = "groups")
    @Builder.Default
    private Set<User> users = new HashSet<>();

    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<GroupPermission> permissions = new HashSet<>();

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}
