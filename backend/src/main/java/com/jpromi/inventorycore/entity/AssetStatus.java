package com.jpromi.inventorycore.entity;

import java.util.UUID;

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
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import com.jpromi.inventorycore.enums.AssetStatusCategory;
import com.jpromi.inventorycore.enums.AssetStatusKey;

/**
 * State of an asset ("Vorhanden", "Defekt", "Ausgeschieden", ...). Built-in statuses have a
 * {@link #systemKey} and no area; custom ones belong to the area they were created for.
 */
@Getter
@Setter
@Entity
@Table(name = "asset_statuses")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class AssetStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @Enumerated(EnumType.STRING)
    @Column(unique = true, length = 32)
    private AssetStatusKey systemKey;

    @Column(nullable = false)
    private String name;

    private String color;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AssetStatusCategory category;

    /** null for the built-in statuses, which apply everywhere. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "area_id")
    private Area area;

    /** Deleted custom statuses stay for the history of the assets that had them. */
    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean deleted = false;

    public boolean isBuiltIn() {
        return systemKey != null;
    }

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}
