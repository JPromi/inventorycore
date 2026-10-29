package com.jpromi.inventorycore.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.jpromi.inventorycore.enums.IntervalUnit;
import com.jpromi.inventorycore.enums.TaskEntryStatus;
import com.jpromi.inventorycore.enums.TaskRunStatus;

/** Transport records of tasks (definitions) and task runs (occurrences with their checklist). */
public final class TaskDtos {
    private TaskDtos() {}

    /**
     * Assets selected by filters: all assets of the task's area (directly or through their
     * location) that match every given criterion; within one list any entry matches.
     */
    public record AssetFilter(List<UUID> locationUuids, boolean includeSubLocations, List<UUID> tagUuids, List<UUID> assetTypeUuids) {}

    public record PointRequest(UUID uuid, String name, String description, boolean perAsset) {}

    /**
     * `onDemand` true = no schedule, runs are started by hand; otherwise `intervalValue`/`intervalUnit`
     * null = once on `startDate`. `filter` null = only the individually chosen assets.
     */
    public record TaskRequest(
        String title,
        String description,
        UUID areaUuid,
        Integer intervalValue,
        IntervalUnit intervalUnit,
        LocalDate startDate,
        Boolean active,
        List<UUID> assignedUserUuids,
        List<UUID> assignedGroupUuids,
        List<PointRequest> points,
        List<UUID> assetUuids,
        AssetFilter filter,
        Boolean onDemand
    ) {}

    /** `type`: USER or GROUP. */
    public record Assignee(String type, UUID uuid, String name) {}

    public record AssigneeOptions(List<Assignee> users, List<Assignee> groups) {}

    public record PointResponse(UUID uuid, String name, String description, boolean perAsset) {}

    public record AssetResponse(UUID uuid, String name, String invId, String assetTypeName, String locationName) {}

    public record TaskResponse(
        UUID uuid,
        String title,
        String description,
        UUID areaUuid,
        String areaName,
        Integer intervalValue,
        IntervalUnit intervalUnit,
        LocalDate startDate,
        LocalDate nextDueDate,
        boolean onDemand,
        boolean active,
        List<Assignee> assignees,
        List<PointResponse> points,
        List<AssetResponse> assets,
        AssetFilter filter,
        String scopeSummary,
        UUID openRunUuid,
        OffsetDateTime lastCompletedAt,
        long runCount,
        OffsetDateTime createdAt,
        String createdByName,
        boolean assignedToMe,
        boolean canStart,
        boolean canEdit,
        boolean canDelete
    ) {}

    public record PreviewRequest(UUID areaUuid, List<UUID> assetUuids, AssetFilter filter) {}

    /** Assets a task with this selection would currently include (at most 200 listed). */
    public record PreviewResponse(int count, List<AssetResponse> assets) {}

    public record RunCounts(int total, int done, int notDone, int pending) {}

    public record RunSummary(
        UUID uuid,
        UUID taskUuid,
        String title,
        UUID areaUuid,
        String areaName,
        LocalDate dueDate,
        TaskRunStatus status,
        boolean overdue,
        boolean recurring,
        String assigneeNames,
        boolean assignedToMe,
        String scopeSummary,
        int assetCount,
        RunCounts counts,
        OffsetDateTime createdAt,
        OffsetDateTime completedAt,
        String completedByName,
        boolean canDelete
    ) {}

    public record EntryResponse(
        UUID uuid,
        UUID pointUuid,
        String pointName,
        String pointDescription,
        UUID assetUuid,
        String assetName,
        String invId,
        String assetTypeName,
        String locationName,
        boolean assetVisible,
        TaskEntryStatus status,
        String comment,
        OffsetDateTime checkedAt,
        String checkedByName
    ) {}

    /**
     * `canWork`: may set results and complete (assigned, or allowed to carry out tasks of the area);
     * `canRestart`: the run is completed and the reader may start its task again.
     */
    public record RunDetail(RunSummary summary, String description, String comment, boolean canWork, boolean canRestart,
        List<EntryResponse> entries) {}

    /** A page of runs plus the tab counts (within the area selection, independent of search and tab). */
    public record RunPage(
        List<RunSummary> items,
        long total,
        int page,
        int size,
        boolean hasMore,
        long mineCount,
        long openCount,
        long overdueCount,
        long completedCount
    ) {}

    /** `status` null = unchanged; `comment` null = unchanged, blank clears. */
    public record EntryUpdateRequest(TaskEntryStatus status, String comment) {}

    public record CompleteRequest(String comment) {}
}
