package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionStatus;

import jakarta.persistence.CascadeType;
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
 * One inspection run. The expected assets are fixed when it is started (from the filters);
 * assets found that do not belong here are added as unexpected items. Once completed it can no
 * longer be changed.
 *
 * <p>Names (type, location, users) are stored as text as well, so the protocol stays readable
 * when the referenced objects are renamed or deleted later.
 */
@Getter
@Setter
@Entity
@Table(name = "inspections")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class Inspection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    /** Null when the type was deleted later; {@link #typeName} keeps the name. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inspection_type_id")
    private InspectionType inspectionType;

    @Column(nullable = false)
    private String typeName;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private InspectionStatus status = InspectionStatus.OPEN;

    // filters used to select the expected assets (uuid lists comma separated) and as readable text
    private UUID filterLocationUuid;
    private boolean filterIncludeSubLocations;
    @Column(columnDefinition = "text")
    private String filterTagUuids;
    @Column(columnDefinition = "text")
    private String filterAssetTypeUuids;
    @Column(columnDefinition = "text")
    private String filterAreaUuids;

    @Column(length = 2000)
    private String filterSummary;

    @Column(columnDefinition = "text")
    private String comment;

    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();
    private UUID createdByUuid;
    private String createdByName;

    private OffsetDateTime completedAt;
    private UUID completedByUuid;
    private String completedByName;

    @OneToMany(mappedBy = "inspection", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    @Builder.Default
    private List<InspectionItem> items = new ArrayList<>();

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }

    public boolean isCompleted() {
        return status == InspectionStatus.COMPLETED;
    }
}
