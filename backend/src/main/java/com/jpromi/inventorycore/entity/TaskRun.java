package com.jpromi.inventorycore.entity;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.jpromi.inventorycore.enums.TaskRunStatus;

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
 * One occurrence of a {@link Task}. While open it follows changes of the task (title, area,
 * assignees, checklist, assets); once completed it is a read-only protocol that keeps its own
 * copies of all names, so it stays readable when the task or assets change or are deleted.
 */
@Getter
@Setter
@Entity
@Table(name = "task_runs")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class TaskRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    /** Null after the task was deleted (only completed runs are kept then). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id")
    private Task task;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_id", nullable = false)
    private Area area;

    @Column(nullable = false)
    private String title;

    @Column(length = 4000)
    private String description;

    @Column(nullable = false)
    private LocalDate dueDate;

    @Column(nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private TaskRunStatus status = TaskRunStatus.OPEN;

    @ElementCollection
    @CollectionTable(name = "task_run_assigned_users", joinColumns = @JoinColumn(name = "task_run_id"))
    @Column(name = "user_uuid", nullable = false)
    @Builder.Default
    private Set<UUID> assignedUserUuids = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "task_run_assigned_groups", joinColumns = @JoinColumn(name = "task_run_id"))
    @Column(name = "group_uuid", nullable = false)
    @Builder.Default
    private Set<UUID> assignedGroupUuids = new HashSet<>();

    /** "Max Muster, Gruppe Atemschutz" as shown when the run was last synchronized or completed. */
    @Column(length = 2000)
    private String assigneeNames;

    /** Readable description of the asset selection. */
    @Column(length = 2000)
    private String scopeSummary;

    @Column(columnDefinition = "text")
    private String comment;

    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();

    private OffsetDateTime completedAt;
    private UUID completedByUuid;
    private String completedByName;

    @OneToMany(mappedBy = "run", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    @Builder.Default
    private List<TaskRunEntry> entries = new ArrayList<>();

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }

    public boolean isCompleted() {
        return status == TaskRunStatus.COMPLETED;
    }
}
