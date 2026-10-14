package com.jpromi.inventorycore.entity;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Optional fixed date for the next inspection of one asset, instead of the interval. It applies
 * until the asset is checked again ({@code setAt} before the check); after that the interval counts.
 */
@Getter
@Setter
@Entity
@Table(name = "asset_inspection_schedules", uniqueConstraints = @UniqueConstraint(columnNames = { "asset_id", "inspection_type_id" }))
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class AssetInspectionSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "asset_id", nullable = false)
    private Asset asset;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inspection_type_id", nullable = false)
    private InspectionType inspectionType;

    @Column(nullable = false)
    private LocalDate fixedDueDate;

    private OffsetDateTime setAt;
    private String setByName;
}
