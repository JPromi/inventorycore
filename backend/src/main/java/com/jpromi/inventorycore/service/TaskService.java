package com.jpromi.inventorycore.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.dto.TaskDtos.AssetFilter;
import com.jpromi.inventorycore.dto.TaskDtos.AssetResponse;
import com.jpromi.inventorycore.dto.TaskDtos.Assignee;
import com.jpromi.inventorycore.dto.TaskDtos.AssigneeOptions;
import com.jpromi.inventorycore.dto.TaskDtos.EntryResponse;
import com.jpromi.inventorycore.dto.TaskDtos.EntryUpdateRequest;
import com.jpromi.inventorycore.dto.TaskDtos.PointRequest;
import com.jpromi.inventorycore.dto.TaskDtos.PointResponse;
import com.jpromi.inventorycore.dto.TaskDtos.PreviewRequest;
import com.jpromi.inventorycore.dto.TaskDtos.PreviewResponse;
import com.jpromi.inventorycore.dto.TaskDtos.RunCounts;
import com.jpromi.inventorycore.dto.TaskDtos.RunDetail;
import com.jpromi.inventorycore.dto.TaskDtos.RunPage;
import com.jpromi.inventorycore.dto.TaskDtos.RunSummary;
import com.jpromi.inventorycore.dto.TaskDtos.TaskRequest;
import com.jpromi.inventorycore.dto.TaskDtos.TaskResponse;
import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.entity.Task;
import com.jpromi.inventorycore.entity.TaskChecklistPoint;
import com.jpromi.inventorycore.entity.TaskRun;
import com.jpromi.inventorycore.entity.TaskRunEntry;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.enums.TaskEntryStatus;
import com.jpromi.inventorycore.enums.TaskRunStatus;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.TagRepository;
import com.jpromi.inventorycore.repository.TaskRepository;
import com.jpromi.inventorycore.repository.TaskRunRepository;

/**
 * Tasks with checklists and their runs.
 *
 * <p>Permissions (resource type TASK, per area of the task): VIEW shows all tasks of the area,
 * CREATE / EDIT / DELETE maintain them, INSPECT carries out every task of the area. Users and
 * groups a task is assigned to always see and carry out its runs. Completed runs are read only;
 * deleting them is for admins, like completed inspection protocols.
 *
 * <p>Runs are created by {@link TaskScheduler} (and right after saving or completing) on the due
 * date. A task never has more than one open run: while a run stays open, the next one waits and
 * is created for the latest due date once the open one is completed.
 */
@Service
public class TaskService {

    private static final Logger log = LoggerFactory.getLogger(TaskService.class);
    /** Most assets the preview lists by name. */
    private static final int PREVIEW_LIMIT = 200;

    private final TaskRepository taskRepository;
    private final TaskRunRepository runRepository;
    private final AssetRepository assetRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LocationRepository locationRepository;
    private final TagRepository tagRepository;
    private final AreaRepository areaRepository;
    private final AppUserRepository userRepository;
    private final GroupRepository groupRepository;
    private final AuditService audit;

    public TaskService(
        TaskRepository taskRepository,
        TaskRunRepository runRepository,
        AssetRepository assetRepository,
        AssetTypeRepository assetTypeRepository,
        LocationRepository locationRepository,
        TagRepository tagRepository,
        AreaRepository areaRepository,
        AppUserRepository userRepository,
        GroupRepository groupRepository,
        AuditService audit
    ) {
        this.taskRepository = taskRepository;
        this.runRepository = runRepository;
        this.assetRepository = assetRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.locationRepository = locationRepository;
        this.tagRepository = tagRepository;
        this.areaRepository = areaRepository;
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
        this.audit = audit;
    }

    /** The current user with permissions and group memberships (including the group of all users). */
    public record Viewer(User user, AccessContext access, Set<UUID> groupUuids) {}

    @Transactional(readOnly = true)
    public Viewer viewer(User user, AccessContext access) {
        Set<UUID> groups = user.getGroups().stream().map(Group::getUuid).collect(Collectors.toCollection(HashSet::new));
        groupRepository.findFirstByEveryoneTrue().ifPresent(everyone -> groups.add(everyone.getUuid()));
        return new Viewer(user, access, groups);
    }

    // ---- tasks ----

    @Transactional(readOnly = true)
    public PageResponse<TaskResponse> taskPage(Viewer viewer, String q, Collection<UUID> areas, int page, int size) {
        List<String> terms = Paging.terms(q);
        Set<UUID> selection = Paging.selection(areas);
        Names names = names();
        List<Task> matches = taskRepository.findAll().stream()
            .filter(task -> canView(viewer, task))
            .filter(task -> Paging.overlapsUuids(List.of(task.getArea().getUuid()), selection))
            .filter(task -> Paging.matches(terms, task.getTitle(), task.getDescription(), task.getArea().getName(),
                assigneeText(task.getAssignedUserUuids(), task.getAssignedGroupUuids(), names)))
            .sorted(Comparator.comparing(Task::getTitle, String.CASE_INSENSITIVE_ORDER))
            .toList();
        return Paging.page(matches, page, size, task -> toResponse(task, viewer, names));
    }

    @Transactional(readOnly = true)
    public TaskResponse task(Viewer viewer, UUID uuid) {
        return toResponse(visibleTask(viewer, uuid), viewer, names());
    }

    /** Runs of one task, newest first (history on the task page). */
    @Transactional(readOnly = true)
    public List<RunSummary> runsOfTask(Viewer viewer, UUID uuid) {
        Task task = visibleTask(viewer, uuid);
        LocalDate today = LocalDate.now();
        return runRepository.findByTaskOrderByDueDateDesc(task).stream()
            .filter(run -> canView(viewer, run))
            .map(run -> toSummary(run, viewer, today))
            .toList();
    }

    /** Users and groups that tasks can be assigned to; for whoever may create or edit tasks somewhere. */
    @Transactional(readOnly = true)
    public AssigneeOptions assigneeOptions(Viewer viewer) {
        require(viewer.access().canAnywhere(PermissionResourceType.TASK, PermissionAction.CREATE)
            || viewer.access().canAnywhere(PermissionResourceType.TASK, PermissionAction.EDIT));
        List<Assignee> users = userRepository.findAll().stream()
            .filter(User::isEnabled)
            .map(user -> new Assignee("USER", user.getUuid(), displayName(user)))
            .sorted(Comparator.comparing(Assignee::name, String.CASE_INSENSITIVE_ORDER))
            .toList();
        List<Assignee> groups = groupRepository.findAll().stream()
            .map(group -> new Assignee("GROUP", group.getUuid(), group.getName()))
            .sorted(Comparator.comparing(Assignee::name, String.CASE_INSENSITIVE_ORDER))
            .toList();
        return new AssigneeOptions(users, groups);
    }

    @Transactional(readOnly = true)
    public PreviewResponse preview(Viewer viewer, PreviewRequest request) {
        Area area = areaOr400(request.areaUuid());
        require(canManage(viewer, area, PermissionAction.CREATE) || canManage(viewer, area, PermissionAction.EDIT));
        Set<Asset> chosen = new HashSet<>();
        if (request.assetUuids() != null) {
            for (UUID assetUuid : request.assetUuids()) {
                chosen.add(visibleAsset(viewer, assetUuid));
            }
        }
        Map<Long, Location> locations = locationsById();
        List<Asset> assets = selectAssets(area, chosen, request.filter());
        return new PreviewResponse(assets.size(), assets.stream()
            .filter(asset -> viewer.access().canViewAsset(asset))
            .limit(PREVIEW_LIMIT)
            .map(asset -> toAssetResponse(asset, locations))
            .toList());
    }

    @Transactional
    public TaskResponse create(Viewer viewer, TaskRequest request) {
        Area area = areaOr400(request.areaUuid());
        require(canManage(viewer, area, PermissionAction.CREATE));
        Task task = Task.builder()
            .title(requireTitle(request.title()))
            .area(area)
            .startDate(request.startDate() == null ? LocalDate.now() : request.startDate())
            .createdByUuid(viewer.user().getUuid())
            .createdByName(displayName(viewer.user()))
            .build();
        apply(task, request, viewer);
        task.setNextDueDate(task.isOnDemand() ? null : task.getStartDate());
        taskRepository.save(task);
        audit.log(AuditAction.CREATE, AuditObjectType.TASK, task.getUuid(), task.getTitle());
        createDueRun(task, LocalDate.now());
        return toResponse(task, viewer, names());
    }

    @Transactional
    public TaskResponse update(Viewer viewer, UUID uuid, TaskRequest request) {
        Task task = visibleTask(viewer, uuid);
        require(canManage(viewer, task.getArea(), PermissionAction.EDIT));
        Area area = areaOr400(request.areaUuid());
        if (!area.getId().equals(task.getArea().getId())) {
            // moving it to another area needs the right there as well
            require(canManage(viewer, area, PermissionAction.EDIT) || canManage(viewer, area, PermissionAction.CREATE));
            task.setArea(area);
        }
        task.setTitle(requireTitle(request.title()));
        if (request.startDate() != null) {
            task.setStartDate(request.startDate());
        }
        apply(task, request, viewer);
        task.setNextDueDate(nextDueDate(task));
        taskRepository.save(task);
        // open runs follow the task; completed ones stay as they were
        Names names = names();
        Map<Long, Location> locations = locationsById();
        for (TaskRun run : runRepository.findByTaskAndStatus(task, TaskRunStatus.OPEN)) {
            sync(run, task, names, locations);
            runRepository.save(run);
        }
        audit.log(AuditAction.UPDATE, AuditObjectType.TASK, task.getUuid(), task.getTitle());
        createDueRun(task, LocalDate.now());
        return toResponse(task, viewer, names);
    }

    @Transactional
    public void delete(Viewer viewer, UUID uuid) {
        Task task = visibleTask(viewer, uuid);
        require(canManage(viewer, task.getArea(), PermissionAction.DELETE));
        // open runs belong to the task; completed ones are protocols and stay
        List<TaskRun> open = runRepository.findByTaskAndStatus(task, TaskRunStatus.OPEN);
        runRepository.deleteAll(open);
        runRepository.flush();
        runRepository.detachTask(task);
        taskRepository.delete(task);
        audit.log(AuditAction.DELETE, AuditObjectType.TASK, task.getUuid(), task.getTitle(),
            AuditDetail.event("TASK_DELETED", "openRuns", open.size()));
    }

    private void apply(Task task, TaskRequest request, Viewer viewer) {
        task.setDescription(blankToNull(request.description()));
        task.setActive(request.active() == null || request.active());
        task.setOnDemand(Boolean.TRUE.equals(request.onDemand()));
        boolean recurring = !task.isOnDemand() && request.intervalValue() != null && request.intervalValue() > 0 && request.intervalUnit() != null;
        task.setIntervalValue(recurring ? request.intervalValue() : null);
        task.setIntervalUnit(recurring ? request.intervalUnit() : null);

        task.getAssignedUserUuids().clear();
        if (request.assignedUserUuids() != null) {
            for (UUID userUuid : request.assignedUserUuids()) {
                userRepository.findByUuid(userUuid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Benutzer " + userUuid));
                task.getAssignedUserUuids().add(userUuid);
            }
        }
        task.getAssignedGroupUuids().clear();
        if (request.assignedGroupUuids() != null) {
            for (UUID groupUuid : request.assignedGroupUuids()) {
                groupRepository.findByUuid(groupUuid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannte Gruppe " + groupUuid));
                task.getAssignedGroupUuids().add(groupUuid);
            }
        }

        // individually chosen assets: the editor must see them; assets kept from before stay even if not visible to this editor
        Set<UUID> requested = request.assetUuids() == null ? Set.of() : new HashSet<>(request.assetUuids());
        Set<Asset> assets = new HashSet<>();
        for (Asset asset : task.getAssets()) {
            if (requested.contains(asset.getUuid())) {
                assets.add(asset);
            }
        }
        for (UUID assetUuid : requested) {
            if (assets.stream().noneMatch(asset -> asset.getUuid().equals(assetUuid))) {
                assets.add(visibleAsset(viewer, assetUuid));
            }
        }
        task.getAssets().clear();
        task.getAssets().addAll(assets);

        AssetFilter filter = request.filter();
        task.setUseFilter(filter != null);
        task.setFilterLocationUuids(filter == null ? null : join(filter.locationUuids()));
        task.setFilterIncludeSubLocations(filter == null || filter.includeSubLocations());
        task.setFilterTagUuids(filter == null ? null : join(filter.tagUuids()));
        task.setFilterAssetTypeUuids(filter == null ? null : join(filter.assetTypeUuids()));

        // keep existing points (and their uuids, which entries of open runs refer to) where possible
        Map<UUID, TaskChecklistPoint> existing = task.getPoints().stream()
            .collect(Collectors.toMap(TaskChecklistPoint::getUuid, point -> point));
        List<TaskChecklistPoint> points = new ArrayList<>();
        List<PointRequest> requests = request.points() == null ? List.of() : request.points();
        for (PointRequest pointRequest : requests) {
            if (pointRequest.name() == null || pointRequest.name().isBlank()) {
                continue;
            }
            TaskChecklistPoint point = pointRequest.uuid() != null ? existing.remove(pointRequest.uuid()) : null;
            if (point == null) {
                point = TaskChecklistPoint.builder().task(task).build();
            }
            point.setName(pointRequest.name().trim());
            point.setDescription(blankToNull(pointRequest.description()));
            point.setPerAsset(pointRequest.perAsset());
            point.setSortOrder(points.size());
            points.add(point);
        }
        if (points.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Die Checkliste braucht mindestens einen Punkt.");
        }
        task.getPoints().clear();
        task.getPoints().addAll(points);
    }

    // ---- runs ----

    @Transactional(readOnly = true)
    public RunPage runPage(Viewer viewer, String q, String tab, Collection<UUID> areas, int page, int size) {
        List<String> terms = Paging.terms(q);
        Set<UUID> selection = Paging.selection(areas);
        LocalDate today = LocalDate.now();
        List<TaskRun> inArea = runRepository.findAll().stream()
            .filter(run -> canView(viewer, run))
            .filter(run -> Paging.overlapsUuids(List.of(run.getArea().getUuid()), selection))
            .toList();
        String chosen = tab == null ? "MINE" : tab;
        List<TaskRun> matches = inArea.stream()
            .filter(run -> switch (chosen) {
                case "MINE" -> !run.isCompleted() && assigned(viewer, run.getAssignedUserUuids(), run.getAssignedGroupUuids());
                case "OPEN" -> !run.isCompleted();
                case "OVERDUE" -> overdue(run, today);
                case "COMPLETED" -> run.isCompleted();
                default -> true;
            })
            .filter(run -> Paging.matches(terms, run.getTitle(), run.getDescription(), run.getAssigneeNames(), run.getScopeSummary(),
                run.getArea().getName(), run.getCompletedByName()))
            // open ones by urgency, then the completed ones newest first
            .sorted(Comparator.comparing(TaskRun::isCompleted)
                .thenComparing(run -> run.isCompleted() ? null : run.getDueDate(), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(TaskRun::getCompletedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();
        PageResponse<RunSummary> result = Paging.page(matches, page, size, run -> toSummary(run, viewer, today));
        return new RunPage(result.items(), result.total(), result.page(), result.size(), result.hasMore(),
            inArea.stream().filter(run -> !run.isCompleted() && assigned(viewer, run.getAssignedUserUuids(), run.getAssignedGroupUuids())).count(),
            inArea.stream().filter(run -> !run.isCompleted()).count(),
            inArea.stream().filter(run -> overdue(run, today)).count(),
            inArea.stream().filter(TaskRun::isCompleted).count());
    }

    @Transactional(readOnly = true)
    public RunDetail run(Viewer viewer, UUID uuid) {
        return toDetail(visibleRun(viewer, uuid), viewer);
    }

    @Transactional
    public EntryResponse updateEntry(Viewer viewer, UUID uuid, UUID entryUuid, EntryUpdateRequest request) {
        TaskRun run = workableRun(viewer, uuid);
        TaskRunEntry entry = run.getEntries().stream()
            .filter(candidate -> candidate.getUuid().equals(entryUuid))
            .findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Eintrag nicht gefunden"));
        if (request.status() != null && request.status() != entry.getStatus()) {
            entry.setStatus(request.status());
            if (request.status() == TaskEntryStatus.PENDING) {
                entry.setCheckedAt(null);
                entry.setCheckedByUuid(null);
                entry.setCheckedByName(null);
            } else {
                entry.setCheckedAt(OffsetDateTime.now());
                entry.setCheckedByUuid(viewer.user().getUuid());
                entry.setCheckedByName(displayName(viewer.user()));
            }
            if (entry.getAssetUuid() != null) {
                audit.log(AuditAction.INSPECT, AuditObjectType.ASSET, entry.getAssetUuid(), entry.getAssetName(), AuditDetail.event(
                    "TASK_ENTRY_RESULT", "task", run.getTitle(), "taskRunUuid", run.getUuid().toString(),
                    "point", entry.getPointName(), "status", request.status().name()));
            }
        }
        if (request.comment() != null) {
            String comment = blankToNull(request.comment());
            entry.setComment(comment != null && comment.length() > 2000 ? comment.substring(0, 2000) : comment);
        }
        runRepository.save(run);
        return toEntry(entry, viewer);
    }

    /** Completes the run: afterwards it is a read-only protocol, and the next run of a recurring task can follow. */
    @Transactional
    public RunDetail complete(Viewer viewer, UUID uuid, String comment) {
        TaskRun run = workableRun(viewer, uuid);
        run.setComment(blankToNull(comment));
        run.setStatus(TaskRunStatus.COMPLETED);
        run.setCompletedAt(OffsetDateTime.now());
        run.setCompletedByUuid(viewer.user().getUuid());
        run.setCompletedByName(displayName(viewer.user()));
        runRepository.save(run);
        RunCounts counts = counts(run);
        audit.log(AuditAction.COMPLETE, AuditObjectType.TASK_RUN, run.getUuid(), run.getTitle(), AuditDetail.event(
            "TASK_RUN_COMPLETED",
            "dueDate", run.getDueDate().toString(),
            "done", counts.done(),
            "notDone", counts.notDone(),
            "pending", counts.pending(),
            "comment", run.getComment()));
        if (run.getTask() != null) {
            createDueRun(run.getTask(), LocalDate.now());
        }
        return toDetail(run, viewer);
    }

    @Transactional
    public void deleteRun(Viewer viewer, UUID uuid) {
        TaskRun run = visibleRun(viewer, uuid);
        require(canDelete(viewer, run));
        runRepository.delete(run);
        audit.log(AuditAction.DELETE, AuditObjectType.TASK_RUN, run.getUuid(), run.getTitle(),
            AuditDetail.event("TASK_RUN_DELETED", "completed", run.isCompleted()));
    }

    // ---- creating runs ----

    /**
     * Starts the task now (any time, also again after a completed run). An open run is returned
     * instead of starting a second one; if the task is due anyway, the due run is created.
     */
    @Transactional
    public RunSummary start(Viewer viewer, UUID uuid) {
        Task task = visibleTask(viewer, uuid);
        require(canStart(viewer, task));
        LocalDate today = LocalDate.now();
        List<TaskRun> open = runRepository.findByTaskAndStatus(task, TaskRunStatus.OPEN);
        if (!open.isEmpty()) {
            return toSummary(open.get(0), viewer, today);
        }
        TaskRun run;
        if (createDueRun(task, today)) {
            run = runRepository.findByTaskAndStatus(task, TaskRunStatus.OPEN).get(0);
        } else {
            run = TaskRun.builder().task(task).area(task.getArea()).title(task.getTitle()).dueDate(today).build();
            sync(run, task, names(), locationsById());
            runRepository.save(run);
            audit.log(AuditAction.CREATE, AuditObjectType.TASK_RUN, run.getUuid(), run.getTitle(),
                AuditDetail.event("TASK_RUN_STARTED", "entries", run.getEntries().size()));
        }
        return toSummary(run, viewer, today);
    }

    /** Tasks whose next run is due today or earlier (for the scheduler, which handles each in its own transaction). */
    @Transactional(readOnly = true)
    public List<UUID> dueTasks() {
        return taskRepository.findByActiveTrueAndNextDueDateLessThanEqual(LocalDate.now()).stream().map(Task::getUuid).toList();
    }

    @Transactional
    public boolean createDueRun(UUID taskUuid) {
        return taskRepository.findByUuid(taskUuid).map(task -> createDueRun(task, LocalDate.now())).orElse(false);
    }

    /**
     * Creates the run for the latest due date up to today, unless the task is paused, not due yet,
     * or still has an open run. Afterwards the next due date is the following occurrence.
     */
    private boolean createDueRun(Task task, LocalDate today) {
        LocalDate next = task.getNextDueDate();
        if (!task.isActive() || next == null || next.isAfter(today) || runRepository.existsByTaskAndStatus(task, TaskRunStatus.OPEN)) {
            return false;
        }
        LocalDate due = next;
        if (task.isRecurring()) {
            // missed occurrences are not made up for; only the latest one is carried out
            for (LocalDate following = occurrenceAfter(task, due); !following.isAfter(today); following = occurrenceAfter(task, due)) {
                due = following;
            }
        }
        TaskRun run = TaskRun.builder().task(task).area(task.getArea()).title(task.getTitle()).dueDate(due).build();
        sync(run, task, names(), locationsById());
        runRepository.save(run);
        task.setNextDueDate(task.isRecurring() ? occurrenceAfter(task, due) : null);
        taskRepository.save(task);
        audit.logAs(null, AuditAction.CREATE, AuditObjectType.TASK_RUN, run.getUuid(), run.getTitle(),
            AuditDetail.event("TASK_RUN_CREATED", "dueDate", due.toString(), "entries", run.getEntries().size()));
        log.info("Created task run {} for task {} due {}", run.getUuid(), task.getUuid(), due);
        return true;
    }

    /** First occurrence (start date + n intervals) after {@code date}; computed from the start so months do not drift. */
    static LocalDate occurrenceAfter(Task task, LocalDate date) {
        LocalDate start = task.getStartDate();
        if (start.isAfter(date)) {
            return start;
        }
        int step = task.getIntervalValue();
        // jump close to the date, then walk (an estimate in days would be off for months and years)
        long days = java.time.temporal.ChronoUnit.DAYS.between(start, date);
        long approx = switch (task.getIntervalUnit()) {
            case DAYS -> days / step;
            case WEEKS -> days / (7L * step);
            case MONTHS -> days / (31L * step);
            case YEARS -> days / (366L * step);
        };
        long count = Math.max(0, approx - 1);
        LocalDate candidate = task.getIntervalUnit().addTo(start, (int) (count * step));
        while (!candidate.isAfter(date)) {
            count++;
            candidate = task.getIntervalUnit().addTo(start, (int) (count * step));
        }
        return candidate;
    }

    /** Next run that has not been created yet, after the schedule was changed. */
    private LocalDate nextDueDate(Task task) {
        if (task.isOnDemand()) {
            return null;
        }
        List<TaskRun> runs = runRepository.findByTaskOrderByDueDateDesc(task);
        if (runs.isEmpty()) {
            return task.getStartDate();
        }
        return task.isRecurring() ? occurrenceAfter(task, runs.get(0).getDueDate()) : null;
    }

    /**
     * Brings an open run in line with its task: texts, area, assignees and the checklist for the
     * currently selected assets. Entries that were worked on stay even if their point or asset
     * no longer belongs to the task.
     */
    private void sync(TaskRun run, Task task, Names names, Map<Long, Location> locations) {
        run.setTitle(task.getTitle());
        run.setDescription(task.getDescription());
        run.setArea(task.getArea());
        run.getAssignedUserUuids().clear();
        run.getAssignedUserUuids().addAll(task.getAssignedUserUuids());
        run.getAssignedGroupUuids().clear();
        run.getAssignedGroupUuids().addAll(task.getAssignedGroupUuids());
        run.setAssigneeNames(truncate(assigneeText(task.getAssignedUserUuids(), task.getAssignedGroupUuids(), names), 2000));
        List<Asset> assets = selectAssets(task.getArea(), task.getAssets(), filterOf(task));
        run.setScopeSummary(truncate(describe(task, assets.size()), 2000));

        Map<String, TaskRunEntry> existing = new LinkedHashMap<>();
        for (TaskRunEntry entry : run.getEntries()) {
            existing.put(key(entry.getPointUuid(), entry.getAssetUuid()), entry);
        }
        List<TaskRunEntry> entries = new ArrayList<>();
        List<TaskChecklistPoint> general = task.getPoints().stream().filter(point -> !point.isPerAsset()).toList();
        List<TaskChecklistPoint> perAsset = task.getPoints().stream().filter(TaskChecklistPoint::isPerAsset).toList();
        for (TaskChecklistPoint point : general) {
            entries.add(entry(run, point, null, existing, locations));
        }
        for (Asset asset : assets) {
            for (TaskChecklistPoint point : perAsset) {
                entries.add(entry(run, point, asset, existing, locations));
            }
        }
        existing.values().stream()
            .filter(entry -> entry.getStatus() != TaskEntryStatus.PENDING || entry.getComment() != null)
            .forEach(entries::add);
        for (int index = 0; index < entries.size(); index++) {
            entries.get(index).setSortOrder(index);
        }
        run.getEntries().clear();
        run.getEntries().addAll(entries);
    }

    private static TaskRunEntry entry(TaskRun run, TaskChecklistPoint point, Asset asset, Map<String, TaskRunEntry> existing, Map<Long, Location> locations) {
        TaskRunEntry entry = existing.remove(key(point.getUuid(), asset == null ? null : asset.getUuid()));
        if (entry == null) {
            entry = TaskRunEntry.builder().run(run).pointUuid(point.getUuid()).build();
        }
        entry.setPointName(point.getName());
        entry.setPointDescription(point.getDescription());
        if (asset != null) {
            entry.setAsset(asset);
            entry.setAssetUuid(asset.getUuid());
            entry.setAssetName(asset.getName());
            entry.setInvId(asset.getInvId());
            entry.setAssetTypeName(asset.getAssetType() == null ? null : asset.getAssetType().getName());
            entry.setLocationName(asset.getLocation() == null ? null : locationPath(asset.getLocation(), locations));
        }
        return entry;
    }

    private static String key(UUID point, UUID asset) {
        return point + "/" + asset;
    }

    // ---- selecting assets ----

    private static AssetFilter filterOf(Task task) {
        return task.isUseFilter()
            ? new AssetFilter(split(task.getFilterLocationUuids()), task.isFilterIncludeSubLocations(),
                split(task.getFilterTagUuids()), split(task.getFilterAssetTypeUuids()))
            : null;
    }

    /**
     * The chosen assets (unless deleted) plus, with a filter, every asset of the area that matches
     * it and is not retired; sorted by name.
     */
    private List<Asset> selectAssets(Area area, Collection<Asset> chosen, AssetFilter filter) {
        Map<Long, Asset> selected = new LinkedHashMap<>();
        chosen.stream().filter(asset -> !asset.isDeleted()).forEach(asset -> selected.put(asset.getId(), asset));
        if (filter != null) {
            boolean byLocation = filter.locationUuids() != null && !filter.locationUuids().isEmpty();
            Set<Long> locationIds = new HashSet<>();
            if (byLocation) {
                Map<Long, List<Location>> children = filter.includeSubLocations() ? childLocations() : Map.of();
                for (UUID uuid : filter.locationUuids()) {
                    locationRepository.findByUuid(uuid).filter(location -> !location.isDeleted())
                        .ifPresent(location -> addWithDescendants(location, children, locationIds));
                }
            }
            Set<UUID> tags = toSet(filter.tagUuids());
            Set<UUID> types = toSet(filter.assetTypeUuids());
            Set<UUID> areas = Set.of(area.getUuid());
            Set<Long> finalLocationIds = byLocation ? locationIds : null;
            assetRepository.findByDeletedFalse().stream()
                .filter(asset -> !asset.isRetired())
                .filter(asset -> Paging.inAreas(asset, areas))
                .filter(asset -> finalLocationIds == null || (asset.getLocation() != null && finalLocationIds.contains(asset.getLocation().getId())))
                .filter(asset -> tags.isEmpty() || asset.getTags().stream().anyMatch(tag -> tags.contains(tag.getUuid()))
                    || (asset.getAssetType() != null && asset.getAssetType().getTags().stream().anyMatch(tag -> tags.contains(tag.getUuid()))))
                .filter(asset -> types.isEmpty() || (asset.getAssetType() != null && types.contains(asset.getAssetType().getUuid())))
                .forEach(asset -> selected.putIfAbsent(asset.getId(), asset));
        }
        return selected.values().stream()
            .sorted(Comparator.comparing(Asset::getName, String.CASE_INSENSITIVE_ORDER))
            .toList();
    }

    private Map<Long, List<Location>> childLocations() {
        Map<Long, List<Location>> children = new HashMap<>();
        for (Location location : locationRepository.findByDeletedFalse()) {
            if (location.getParentLocation() != null) {
                children.computeIfAbsent(location.getParentLocation().getId(), key -> new ArrayList<>()).add(location);
            }
        }
        return children;
    }

    private static void addWithDescendants(Location root, Map<Long, List<Location>> children, Set<Long> ids) {
        List<Location> queue = new ArrayList<>(List.of(root));
        while (!queue.isEmpty()) {
            Location current = queue.remove(queue.size() - 1);
            if (ids.add(current.getId())) {
                queue.addAll(children.getOrDefault(current.getId(), List.of()));
            }
        }
    }

    /** "2 einzeln gewählte Assets · Filter: Typen: Computer · 14 Assets" */
    private String describe(Task task, int assetCount) {
        List<String> parts = new ArrayList<>();
        long chosen = task.getAssets().stream().filter(asset -> !asset.isDeleted()).count();
        if (chosen > 0) {
            parts.add(chosen == 1 ? "1 einzeln gewähltes Asset" : chosen + " einzeln gewählte Assets");
        }
        AssetFilter filter = filterOf(task);
        if (filter != null) {
            List<String> criteria = new ArrayList<>();
            names(filter.locationUuids(), uuid -> locationRepository.findByUuid(uuid).map(Location::getName).orElse(null))
                .ifPresent(text -> criteria.add("Standorte: " + text + (filter.includeSubLocations() ? " (inkl. Unterstandorte)" : "")));
            names(filter.tagUuids(), uuid -> tagRepository.findByUuid(uuid).map(Tag::getName).orElse(null))
                .ifPresent(text -> criteria.add("Tags: " + text));
            names(filter.assetTypeUuids(), uuid -> assetTypeRepository.findByUuid(uuid).map(AssetType::getName).orElse(null))
                .ifPresent(text -> criteria.add("Typen: " + text));
            parts.add(criteria.isEmpty() ? "Alle Assets des Bereichs " + task.getArea().getName() : "Filter: " + String.join(", ", criteria));
        }
        if (parts.isEmpty()) {
            return "Ohne Assets";
        }
        parts.add(assetCount == 1 ? "1 Asset" : assetCount + " Assets");
        return String.join(" · ", parts);
    }

    private static java.util.Optional<String> names(List<UUID> uuids, java.util.function.Function<UUID, String> lookup) {
        if (uuids == null || uuids.isEmpty()) {
            return java.util.Optional.empty();
        }
        String text = uuids.stream().map(lookup).filter(Objects::nonNull).collect(Collectors.joining(", "));
        return text.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(text);
    }

    // ---- permissions ----

    private static boolean assigned(Viewer viewer, Set<UUID> users, Set<UUID> groups) {
        return users.contains(viewer.user().getUuid()) || groups.stream().anyMatch(viewer.groupUuids()::contains);
    }

    private static boolean canManage(Viewer viewer, Area area, PermissionAction action) {
        return viewer.access().can(PermissionResourceType.TASK, action, Set.of(area));
    }

    /** Any right for tasks of the area, or assigned. */
    private static boolean canView(Viewer viewer, Task task) {
        return canSeeArea(viewer, task.getArea()) || assigned(viewer, task.getAssignedUserUuids(), task.getAssignedGroupUuids());
    }

    private static boolean canView(Viewer viewer, TaskRun run) {
        return canSeeArea(viewer, run.getArea()) || assigned(viewer, run.getAssignedUserUuids(), run.getAssignedGroupUuids());
    }

    private static boolean canSeeArea(Viewer viewer, Area area) {
        Set<Area> areas = Set.of(area);
        AccessContext access = viewer.access();
        return access.can(PermissionResourceType.TASK, PermissionAction.VIEW, areas)
            || access.can(PermissionResourceType.TASK, PermissionAction.EDIT, areas)
            || access.can(PermissionResourceType.TASK, PermissionAction.INSPECT, areas);
    }

    /** Carrying out: assigned, or the right to carry out (INSPECT) or edit tasks of the area. */
    private static boolean canWork(Viewer viewer, TaskRun run) {
        Set<Area> areas = Set.of(run.getArea());
        return !run.isCompleted() && (assigned(viewer, run.getAssignedUserUuids(), run.getAssignedGroupUuids())
            || viewer.access().can(PermissionResourceType.TASK, PermissionAction.INSPECT, areas)
            || viewer.access().can(PermissionResourceType.TASK, PermissionAction.EDIT, areas));
    }

    /** Starting a run: assigned, or the right to carry out (INSPECT) or edit tasks of the area. */
    private static boolean canStart(Viewer viewer, Task task) {
        Set<Area> areas = Set.of(task.getArea());
        return assigned(viewer, task.getAssignedUserUuids(), task.getAssignedGroupUuids())
            || viewer.access().can(PermissionResourceType.TASK, PermissionAction.INSPECT, areas)
            || viewer.access().can(PermissionResourceType.TASK, PermissionAction.EDIT, areas);
    }

    /** A completed run is a record: only admins delete it. An open one: whoever may delete tasks of the area. */
    private static boolean canDelete(Viewer viewer, TaskRun run) {
        return run.isCompleted() ? viewer.access().isAdmin() : canManage(viewer, run.getArea(), PermissionAction.DELETE);
    }

    private Task visibleTask(Viewer viewer, UUID uuid) {
        return taskRepository.findByUuid(uuid)
            .filter(task -> canView(viewer, task))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Aufgabe nicht gefunden"));
    }

    private TaskRun visibleRun(Viewer viewer, UUID uuid) {
        return runRepository.findByUuid(uuid)
            .filter(run -> canView(viewer, run))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Aufgabe nicht gefunden"));
    }

    private TaskRun workableRun(Viewer viewer, UUID uuid) {
        TaskRun run = visibleRun(viewer, uuid);
        if (run.isCompleted()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Die Aufgabe ist abgeschlossen und kann nicht mehr geändert werden.");
        }
        require(canWork(viewer, run));
        return run;
    }

    private Asset visibleAsset(Viewer viewer, UUID uuid) {
        return assetRepository.findByUuid(uuid)
            .filter(asset -> !asset.isDeleted() && viewer.access().canViewAsset(asset))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekanntes Asset " + uuid));
    }

    private Area areaOr400(UUID uuid) {
        if (uuid == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte einen Bereich wählen.");
        }
        return areaRepository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannter Bereich"));
    }

    // ---- mapping ----

    /** Display names of users and groups, looked up once per request. */
    private record Names(Map<UUID, String> users, Map<UUID, String> groups) {}

    private Names names() {
        Map<UUID, String> users = new HashMap<>();
        userRepository.findAll().forEach(user -> users.put(user.getUuid(), displayName(user)));
        Map<UUID, String> groups = new HashMap<>();
        groupRepository.findAll().forEach(group -> groups.put(group.getUuid(), group.getName()));
        return new Names(users, groups);
    }

    private static List<Assignee> assignees(Set<UUID> users, Set<UUID> groups, Names names) {
        List<Assignee> result = new ArrayList<>();
        users.stream().filter(names.users()::containsKey)
            .map(uuid -> new Assignee("USER", uuid, names.users().get(uuid)))
            .sorted(Comparator.comparing(Assignee::name, String.CASE_INSENSITIVE_ORDER))
            .forEach(result::add);
        groups.stream().filter(names.groups()::containsKey)
            .map(uuid -> new Assignee("GROUP", uuid, names.groups().get(uuid)))
            .sorted(Comparator.comparing(Assignee::name, String.CASE_INSENSITIVE_ORDER))
            .forEach(result::add);
        return result;
    }

    private static String assigneeText(Set<UUID> users, Set<UUID> groups, Names names) {
        return assignees(users, groups, names).stream()
            .map(assignee -> "GROUP".equals(assignee.type()) ? "Gruppe " + assignee.name() : assignee.name())
            .collect(Collectors.joining(", "));
    }

    private TaskResponse toResponse(Task task, Viewer viewer, Names names) {
        Map<Long, Location> locations = locationsById();
        List<TaskRun> runs = runRepository.findByTaskOrderByDueDateDesc(task);
        AssetFilter filter = filterOf(task);
        List<Asset> selected = selectAssets(task.getArea(), task.getAssets(), filter);
        return new TaskResponse(
            task.getUuid(),
            task.getTitle(),
            task.getDescription(),
            task.getArea().getUuid(),
            task.getArea().getName(),
            task.getIntervalValue(),
            task.getIntervalUnit(),
            task.getStartDate(),
            task.getNextDueDate(),
            task.isOnDemand(),
            task.isActive(),
            assignees(task.getAssignedUserUuids(), task.getAssignedGroupUuids(), names),
            task.getPoints().stream()
                .map(point -> new PointResponse(point.getUuid(), point.getName(), point.getDescription(), point.isPerAsset()))
                .toList(),
            task.getAssets().stream()
                .filter(asset -> !asset.isDeleted() && viewer.access().canViewAsset(asset))
                .sorted(Comparator.comparing(Asset::getName, String.CASE_INSENSITIVE_ORDER))
                .map(asset -> toAssetResponse(asset, locations))
                .toList(),
            filter,
            describe(task, selected.size()),
            runs.stream().filter(run -> !run.isCompleted()).map(TaskRun::getUuid).findFirst().orElse(null),
            runs.stream().map(TaskRun::getCompletedAt).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null),
            runs.size(),
            task.getCreatedAt(),
            task.getCreatedByName(),
            assigned(viewer, task.getAssignedUserUuids(), task.getAssignedGroupUuids()),
            canStart(viewer, task),
            canManage(viewer, task.getArea(), PermissionAction.EDIT),
            canManage(viewer, task.getArea(), PermissionAction.DELETE)
        );
    }

    private static AssetResponse toAssetResponse(Asset asset, Map<Long, Location> locations) {
        return new AssetResponse(
            asset.getUuid(),
            asset.getName(),
            asset.getInvId(),
            asset.getAssetType() == null ? null : asset.getAssetType().getName(),
            asset.getLocation() == null ? null : locationPath(asset.getLocation(), locations));
    }

    private static RunCounts counts(TaskRun run) {
        int done = 0;
        int notDone = 0;
        int pending = 0;
        for (TaskRunEntry entry : run.getEntries()) {
            switch (entry.getStatus()) {
                case DONE -> done++;
                case NOT_DONE -> notDone++;
                case PENDING -> pending++;
            }
        }
        return new RunCounts(run.getEntries().size(), done, notDone, pending);
    }

    private static boolean overdue(TaskRun run, LocalDate today) {
        return !run.isCompleted() && run.getDueDate().isBefore(today);
    }

    private static RunSummary toSummary(TaskRun run, Viewer viewer, LocalDate today) {
        return new RunSummary(
            run.getUuid(),
            run.getTask() == null ? null : run.getTask().getUuid(),
            run.getTitle(),
            run.getArea().getUuid(),
            run.getArea().getName(),
            run.getDueDate(),
            run.getStatus(),
            overdue(run, today),
            run.getTask() != null && run.getTask().isRecurring(),
            run.getAssigneeNames(),
            assigned(viewer, run.getAssignedUserUuids(), run.getAssignedGroupUuids()),
            run.getScopeSummary(),
            (int) run.getEntries().stream().map(TaskRunEntry::getAssetUuid).filter(Objects::nonNull).distinct().count(),
            counts(run),
            run.getCreatedAt(),
            run.getCompletedAt(),
            run.getCompletedByName(),
            canDelete(viewer, run)
        );
    }

    private RunDetail toDetail(TaskRun run, Viewer viewer) {
        return new RunDetail(
            toSummary(run, viewer, LocalDate.now()),
            run.getDescription(),
            run.getComment(),
            canWork(viewer, run),
            run.isCompleted() && run.getTask() != null && canStart(viewer, run.getTask()),
            run.getEntries().stream().map(entry -> toEntry(entry, viewer)).toList());
    }

    /** Assignees see the asset names of their task; the link to the asset needs the right to view it. */
    private static EntryResponse toEntry(TaskRunEntry entry, Viewer viewer) {
        Asset asset = entry.getAsset();
        return new EntryResponse(
            entry.getUuid(),
            entry.getPointUuid(),
            entry.getPointName(),
            entry.getPointDescription(),
            entry.getAssetUuid(),
            entry.getAssetName(),
            entry.getInvId(),
            entry.getAssetTypeName(),
            entry.getLocationName(),
            asset != null && !asset.isDeleted() && viewer.access().canViewAsset(asset),
            entry.getStatus(),
            entry.getComment(),
            entry.getCheckedAt(),
            entry.getCheckedByName());
    }

    // ---- helpers ----

    private Map<Long, Location> locationsById() {
        return locationRepository.findAll().stream().collect(Collectors.toMap(Location::getId, location -> location));
    }

    /** "Gerätehaus / Fahrzeughalle" */
    private static String locationPath(Location location, Map<Long, Location> locations) {
        List<String> names = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        Location current = location;
        while (current != null && seen.add(current.getId())) {
            names.add(0, current.getName());
            Location parent = current.getParentLocation();
            current = parent == null ? null : locations.getOrDefault(parent.getId(), parent);
        }
        return String.join(" / ", names);
    }

    private static void require(boolean allowed) {
        PermissionService.require(allowed);
    }

    private static String requireTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Titel ist erforderlich.");
        }
        return title.trim();
    }

    private static String displayName(User user) {
        return user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getUsername() : user.getDisplayName();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String truncate(String value, int length) {
        return value == null || value.length() <= length ? value : value.substring(0, length);
    }

    private static Set<UUID> toSet(Collection<UUID> uuids) {
        return uuids == null ? Set.of() : new HashSet<>(uuids);
    }

    private static String join(List<UUID> uuids) {
        return uuids == null || uuids.isEmpty() ? null : uuids.stream().map(UUID::toString).collect(Collectors.joining(","));
    }

    private static List<UUID> split(String value) {
        return value == null || value.isBlank() ? List.of() : Arrays.stream(value.split(",")).map(UUID::fromString).toList();
    }
}
