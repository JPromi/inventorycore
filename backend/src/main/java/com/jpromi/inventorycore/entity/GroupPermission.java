package com.jpromi.inventorycore.entity;

import java.util.UUID;

import com.jpromi.inventorycore.enums.PermissionResourceType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
    name = "group_permissions",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"group_id", "resource_type", "area_id"})
    }
)
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class GroupPermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private PermissionResourceType resourceType;

    /** The area this permission applies to; {@code null} means all areas. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "area_id")
    private Area area;

    @Column(nullable = false)
    @Builder.Default
    private boolean canView = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean canEdit = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean canInspect = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean canDelete = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean admin = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean canCreate = false;

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}
