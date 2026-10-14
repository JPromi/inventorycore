package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionMode;
import com.jpromi.inventorycore.enums.IntervalUnit;

import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Kind of inspection (e.g. "Fahrzeug", "EDV-Inventur") with the check fields that are filled per
 * asset. A field applies to all assets or only to assets of one type.
 */
@Getter
@Setter
@Entity
@Table(name = "inspection_types")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class InspectionType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @Column(nullable = false)
    private String name;

    @Column(length = 2000)
    private String description;

    private String color;

    /** Null for rows created before modes existed; see {@link #getMode()}. */
    @Enumerated(EnumType.STRING)
    private InspectionMode mode;

    /** Repeat every {@code intervalValue} {@code intervalUnit}; both null = no recurring inspection. */
    private Integer intervalValue;

    @Enumerated(EnumType.STRING)
    private IntervalUnit intervalUnit;

    /**
     * Inventory: besides present / missing, also check whether the asset works (in order / defect).
     * Default for new inspections; nullable, so the column can be added to existing tables.
     */
    private Boolean checkFunction;

    /** Asset types this inspection is for; empty = all assets. */
    @ManyToMany
    @JoinTable(
        name = "inspection_type_asset_types",
        joinColumns = @JoinColumn(name = "inspection_type_id"),
        inverseJoinColumns = @JoinColumn(name = "asset_type_id")
    )
    @Builder.Default
    private Set<AssetType> assetTypes = new HashSet<>();

    /** Areas this inspection is for; empty = all areas. Only users who may inspect there use it. */
    @ManyToMany
    @JoinTable(
        name = "inspection_type_areas",
        joinColumns = @JoinColumn(name = "inspection_type_id"),
        inverseJoinColumns = @JoinColumn(name = "area_id")
    )
    @Builder.Default
    private Set<Area> areas = new HashSet<>();

    @OneToMany(mappedBy = "inspectionType", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    @Builder.Default
    private List<InspectionFieldDefinition> fields = new ArrayList<>();

    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }

    public InspectionMode getMode() {
        return mode == null ? InspectionMode.INVENTORY : mode;
    }

    public boolean isCheckFunction() {
        return getMode() == InspectionMode.INVENTORY && Boolean.TRUE.equals(checkFunction);
    }

    public boolean isRecurring() {
        return intervalValue != null && intervalValue > 0 && intervalUnit != null;
    }

    /** Whether assets of this type need this inspection. */
    public boolean appliesTo(AssetType assetType) {
        return assetTypes.isEmpty() || (assetType != null && assetTypes.stream().anyMatch(type -> type.getId().equals(assetType.getId())));
    }

    /** Whether the asset needs this inspection: matching type and in one of the areas. */
    public boolean appliesTo(Asset asset) {
        return appliesTo(asset.getAssetType()) && coversAreas(asset.getAreas());
    }

    /** No areas set = everywhere; otherwise at least one shared area. */
    public boolean coversAreas(Set<Area> other) {
        return areas.isEmpty() || other.stream().anyMatch(area -> areas.stream().anyMatch(own -> own.getId().equals(area.getId())));
    }
}
