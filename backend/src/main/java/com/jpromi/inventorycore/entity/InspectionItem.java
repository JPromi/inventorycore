package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionCheckMethod;
import com.jpromi.inventorycore.enums.InspectionItemStatus;

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
 * One asset in an inspection. {@code expected} is false for assets that were found here but do
 * not belong to the inspection (foreign objects) and for unknown codes ({@code asset} is null).
 */
@Getter
@Setter
@Entity
@Table(name = "inspection_items")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class InspectionItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inspection_id", nullable = false)
    private Inspection inspection;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id")
    private Asset asset;

    // snapshot of the asset when it was added
    private String assetName;
    private String invId;
    private String serialNumber;
    private UUID assetTypeUuid;
    private String assetTypeName;
    @Column(length = 1000)
    private String locationName;

    private boolean expected;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private InspectionItemStatus status = InspectionItemStatus.PENDING;

    @Enumerated(EnumType.STRING)
    private InspectionCheckMethod method;

    /** The code as scanned (for unknown codes the only information there is). */
    private String scannedCode;

    private OffsetDateTime checkedAt;
    private UUID checkedByUuid;
    private String checkedByName;

    @Column(length = 2000)
    private String note;

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    @Builder.Default
    private List<InspectionItemValue> values = new ArrayList<>();

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    @Builder.Default
    private List<InspectionItemPhoto> photos = new ArrayList<>();

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}
