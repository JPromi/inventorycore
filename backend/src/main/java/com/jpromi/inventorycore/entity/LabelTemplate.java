package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/**
 * Layout of a printable label. The elements (texts, barcodes) are stored as JSON
 * and interpreted by the frontend; positions and sizes are in millimeters.
 */
@Getter
@Setter
@Entity
@Table(name = "label_templates")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class LabelTemplate {

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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_id", nullable = false)
    private Area area;

    /** Preselected template for assets of this area. At most one per area. */
    @Column(nullable = false)
    @Builder.Default
    private boolean defaultForArea = false;

    @Column(nullable = false)
    private double widthMm;

    @Column(nullable = false)
    private double heightMm;

    /**
     * Margin along every edge that elements must keep free. Templates from before the safe area
     * existed get 0, so their layout stays valid.
     */
    @Column(nullable = false, columnDefinition = "double precision default 0")
    @Builder.Default
    private double safeAreaMm = 0;

    @Column(nullable = false, columnDefinition = "text")
    @Builder.Default
    private String elementsJson = "[]";

    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}
