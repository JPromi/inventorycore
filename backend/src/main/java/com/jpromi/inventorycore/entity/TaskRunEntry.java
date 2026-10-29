package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.jpromi.inventorycore.enums.TaskEntryStatus;

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

/**
 * One checklist point of a run: for the whole run ({@code asset} and {@code assetName} null) or
 * for one affected asset. Point and asset are copied as text so the protocol keeps them.
 */
@Getter
@Setter
@Entity
@Table(name = "task_run_entries")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class TaskRunEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_run_id", nullable = false)
    private TaskRun run;

    /** Uuid of the {@link TaskChecklistPoint}; no foreign key, the point may be removed later. */
    @Column(nullable = false)
    private UUID pointUuid;

    @Column(nullable = false)
    private String pointName;

    @Column(length = 2000)
    private String pointDescription;

    @Builder.Default
    private int sortOrder = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id")
    private Asset asset;

    // snapshot of the asset (null for points of the whole run)
    private UUID assetUuid;
    private String assetName;
    private String invId;
    private String assetTypeName;
    @Column(length = 1000)
    private String locationName;

    @Column(nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private TaskEntryStatus status = TaskEntryStatus.PENDING;

    @Column(length = 2000)
    private String comment;

    private OffsetDateTime checkedAt;
    private UUID checkedByUuid;
    private String checkedByName;

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}
