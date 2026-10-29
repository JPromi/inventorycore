package com.jpromi.inventorycore.entity;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.IntervalUnit;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
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
 * A task with a checklist (e.g. "Windows-Updates prüfen" every 10 days), assigned to users and/or
 * groups. Each occurrence is carried out as a {@link TaskRun}; one-time tasks have one run.
 *
 * <p>Affected assets are chosen individually and/or by filters (locations, tags, types) that are
 * applied again for every run, so new matching assets are included. Checklist points marked
 * {@code perAsset} are worked on once per affected asset, the others once per run.
 *
 * <p>Assignees are stored as user and group UUIDs without foreign keys, so deleting a user or
 * group keeps working; unknown UUIDs are ignored.
 */
@Getter
@Setter
@Entity
@Table(name = "tasks")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @Column(nullable = false)
    private String title;

    @Column(length = 4000)
    private String description;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_id", nullable = false)
    private Area area;

    /** Repeat every {@code intervalValue} {@code intervalUnit} from {@link #startDate}; both null = once. */
    private Integer intervalValue;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private IntervalUnit intervalUnit;

    /** Due date of the first run. */
    @Column(nullable = false)
    private LocalDate startDate;

    /** Due date of the next run that has not been created yet; null = no further runs. */
    private LocalDate nextDueDate;

    /** Carried out whenever someone starts it; no runs are created automatically. */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean onDemand;

    /** Paused tasks create no new runs. */
    @Column(nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean active = true;

    @ElementCollection
    @CollectionTable(name = "task_assigned_users", joinColumns = @JoinColumn(name = "task_id"))
    @Column(name = "user_uuid", nullable = false)
    @Builder.Default
    private Set<UUID> assignedUserUuids = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "task_assigned_groups", joinColumns = @JoinColumn(name = "task_id"))
    @Column(name = "group_uuid", nullable = false)
    @Builder.Default
    private Set<UUID> assignedGroupUuids = new HashSet<>();

    @OneToMany(mappedBy = "task", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    @Builder.Default
    private List<TaskChecklistPoint> points = new ArrayList<>();

    /** Individually chosen assets. */
    @ManyToMany
    @JoinTable(name = "task_assets", joinColumns = @JoinColumn(name = "task_id"), inverseJoinColumns = @JoinColumn(name = "asset_id"))
    @Builder.Default
    private Set<Asset> assets = new HashSet<>();

    /** Whether the filters below select assets (all assets of the task's area matching them). */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean useFilter;

    // filters, uuid lists comma separated (like inspections; no foreign keys, deleted objects are ignored)
    @Column(columnDefinition = "text")
    private String filterLocationUuids;
    @Column(nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean filterIncludeSubLocations = true;
    @Column(columnDefinition = "text")
    private String filterTagUuids;
    @Column(columnDefinition = "text")
    private String filterAssetTypeUuids;

    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();
    private UUID createdByUuid;
    private String createdByName;

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }

    public boolean isRecurring() {
        return intervalValue != null && intervalValue > 0 && intervalUnit != null;
    }
}
