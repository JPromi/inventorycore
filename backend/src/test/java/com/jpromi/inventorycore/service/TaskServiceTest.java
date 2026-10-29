package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.TaskDtos.EntryUpdateRequest;
import com.jpromi.inventorycore.dto.TaskDtos.PointRequest;
import com.jpromi.inventorycore.dto.TaskDtos.TaskRequest;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.Task;
import com.jpromi.inventorycore.entity.TaskRun;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.IntervalUnit;
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

class TaskServiceTest {

    private final TaskRepository tasks = mock(TaskRepository.class);
    private final TaskRunRepository runs = mock(TaskRunRepository.class);
    private final AssetRepository assets = mock(AssetRepository.class);
    private final AreaRepository areas = mock(AreaRepository.class);
    private final AppUserRepository users = mock(AppUserRepository.class);
    private final GroupRepository groups = mock(GroupRepository.class);
    private final List<TaskRun> savedRuns = new ArrayList<>();
    private TaskService service;
    private Area area;
    private Asset first;
    private Asset second;
    private User manager;
    private User assignee;
    private User stranger;

    @BeforeEach
    void setUp() {
        service = new TaskService(tasks, runs, assets, mock(AssetTypeRepository.class), mock(LocationRepository.class),
            mock(TagRepository.class), areas, users, groups, mock(AuditService.class));
        area = Area.builder().id(1L).name("Atemschutz").build();
        first = Asset.builder().id(1L).name("Atemschutzgerät 1").invId("AS-1").areas(Set.of(area)).build();
        second = Asset.builder().id(2L).name("Atemschutzgerät 2").invId("AS-2").areas(Set.of(area)).build();
        manager = User.builder().uuid(UUID.randomUUID()).username("leitung").build();
        assignee = User.builder().uuid(UUID.randomUUID()).username("geraetewart").build();
        stranger = User.builder().uuid(UUID.randomUUID()).username("gast").build();
        when(areas.findByUuid(area.getUuid())).thenReturn(Optional.of(area));
        when(assets.findByUuid(first.getUuid())).thenReturn(Optional.of(first));
        when(assets.findByUuid(second.getUuid())).thenReturn(Optional.of(second));
        when(users.findByUuid(assignee.getUuid())).thenReturn(Optional.of(assignee));
        when(users.findAll()).thenReturn(List.of(manager, assignee, stranger));
        when(groups.findFirstByEveryoneTrue()).thenReturn(Optional.empty());
        when(tasks.save(any(Task.class))).thenAnswer(call -> call.getArgument(0));
        when(runs.save(any(TaskRun.class))).thenAnswer(call -> {
            TaskRun run = call.getArgument(0);
            if (!savedRuns.contains(run)) {
                savedRuns.add(run);
            }
            return run;
        });
        when(runs.findByUuid(any())).thenAnswer(call -> savedRuns.stream().filter(run -> run.getUuid().equals(call.getArgument(0))).findFirst());
    }

    @Test
    void occurrencesFollowTheStartDateWithoutDrift() {
        Task monthly = Task.builder().startDate(LocalDate.of(2026, 1, 31)).intervalValue(1).intervalUnit(IntervalUnit.MONTHS).build();
        assertEquals(LocalDate.of(2026, 2, 28), TaskService.occurrenceAfter(monthly, LocalDate.of(2026, 1, 31)));
        // from the start date, not from the shortened February date
        assertEquals(LocalDate.of(2026, 3, 31), TaskService.occurrenceAfter(monthly, LocalDate.of(2026, 2, 28)));

        Task everyTenDays = Task.builder().startDate(LocalDate.of(2026, 10, 1)).intervalValue(10).intervalUnit(IntervalUnit.DAYS).build();
        assertEquals(LocalDate.of(2026, 10, 1), TaskService.occurrenceAfter(everyTenDays, LocalDate.of(2026, 9, 1)));
        assertEquals(LocalDate.of(2026, 10, 31), TaskService.occurrenceAfter(everyTenDays, LocalDate.of(2026, 10, 29)));
        assertEquals(LocalDate.of(2027, 10, 26), TaskService.occurrenceAfter(everyTenDays, LocalDate.of(2027, 10, 25)));
    }

    @Test
    void creatingADueTaskCreatesItsRunWithGeneralAndPerAssetPoints() {
        service.create(viewer(manager, permission(true)), request(LocalDate.now()));

        assertEquals(1, savedRuns.size());
        TaskRun run = savedRuns.get(0);
        assertEquals(LocalDate.now(), run.getDueDate());
        // one general point plus one point per asset
        assertEquals(3, run.getEntries().size());
        assertEquals("Fahrzeugbuch geprüft", run.getEntries().get(0).getPointName());
        assertEquals(null, run.getEntries().get(0).getAssetUuid());
        assertEquals(first.getUuid(), run.getEntries().get(1).getAssetUuid());
        assertEquals(second.getUuid(), run.getEntries().get(2).getAssetUuid());
        assertTrue(run.getAssignedUserUuids().contains(assignee.getUuid()));
    }

    @Test
    void assigneesWorkOnRunsWithoutTaskPermissionsOthersDoNotSeeThem() {
        service.create(viewer(manager, permission(true)), request(LocalDate.now()));
        TaskRun run = savedRuns.get(0);
        UUID entry = run.getEntries().get(1).getUuid();

        service.updateEntry(viewer(assignee), run.getUuid(), entry, new EntryUpdateRequest(TaskEntryStatus.DONE, "Druck geprüft"));
        assertEquals(TaskEntryStatus.DONE, run.getEntries().get(1).getStatus());
        assertEquals("Druck geprüft", run.getEntries().get(1).getComment());

        ResponseStatusException hidden = assertThrows(ResponseStatusException.class,
            () -> service.updateEntry(viewer(stranger), run.getUuid(), entry, new EntryUpdateRequest(TaskEntryStatus.NOT_DONE, null)));
        assertEquals(HttpStatus.NOT_FOUND, hidden.getStatusCode());
    }

    @Test
    void completedRunsCannotBeChangedAnymore() {
        service.create(viewer(manager, permission(true)), request(LocalDate.now()));
        TaskRun run = savedRuns.get(0);
        service.complete(viewer(assignee), run.getUuid(), "Alles erledigt");
        assertEquals(TaskRunStatus.COMPLETED, run.getStatus());

        ResponseStatusException locked = assertThrows(ResponseStatusException.class, () -> service.updateEntry(
            viewer(assignee), run.getUuid(), run.getEntries().get(0).getUuid(), new EntryUpdateRequest(TaskEntryStatus.PENDING, null)));
        assertEquals(HttpStatus.CONFLICT, locked.getStatusCode());
    }

    @Test
    void futureTasksWaitForTheirDueDate() {
        service.create(viewer(manager, permission(true)), request(LocalDate.now().plusDays(3)));
        assertTrue(savedRuns.isEmpty());
    }

    @Test
    void onDemandTasksAreStartedByHandAndAgainAfterCompletion() {
        TaskRequest base = request(LocalDate.now());
        TaskRequest onDemand = new TaskRequest(base.title(), null, area.getUuid(), null, null, null, true,
            base.assignedUserUuids(), List.of(), base.points(), base.assetUuids(), null, true);
        var created = service.create(viewer(manager, permission(true)), onDemand);
        assertTrue(savedRuns.isEmpty());
        assertEquals(null, created.nextDueDate());

        Task task = savedTask();
        when(runs.findByTaskAndStatus(task, TaskRunStatus.OPEN))
            .thenAnswer(call -> savedRuns.stream().filter(run -> !run.isCompleted()).toList());
        var first = service.start(viewer(assignee), task.getUuid());
        // starting again while it is open returns the same run
        assertEquals(first.uuid(), service.start(viewer(assignee), task.getUuid()).uuid());
        service.complete(viewer(assignee), first.uuid(), null);
        var second = service.start(viewer(assignee), task.getUuid());
        assertEquals(2, savedRuns.size());
        assertTrue(!second.uuid().equals(first.uuid()));

        ResponseStatusException hidden = assertThrows(ResponseStatusException.class,
            () -> service.start(viewer(stranger), task.getUuid()));
        assertEquals(HttpStatus.NOT_FOUND, hidden.getStatusCode());
    }

    @Test
    void creatingNeedsTheTaskRight() {
        ResponseStatusException denied = assertThrows(ResponseStatusException.class,
            () -> service.create(viewer(manager, permission(false)), request(LocalDate.now())));
        assertEquals(HttpStatus.FORBIDDEN, denied.getStatusCode());
    }

    private TaskRequest request(LocalDate start) {
        return new TaskRequest("Atemschutz-Kontrolle", null, area.getUuid(), 10, IntervalUnit.DAYS, start, true,
            List.of(assignee.getUuid()), List.of(),
            List.of(new PointRequest(null, "Fahrzeugbuch geprüft", null, false), new PointRequest(null, "Flaschendruck", null, true)),
            List.of(first.getUuid(), second.getUuid()), null, false);
    }

    private Task savedTask() {
        ArgumentCaptor<Task> captor = ArgumentCaptor.forClass(Task.class);
        verify(tasks, atLeastOnce()).save(captor.capture());
        Task task = captor.getValue();
        when(tasks.findByUuid(task.getUuid())).thenReturn(Optional.of(task));
        return task;
    }

    private GroupPermission permission(boolean create) {
        return GroupPermission.builder().resourceType(PermissionResourceType.TASK).area(area)
            .canView(true).canCreate(create).canEdit(create).build();
    }

    private TaskService.Viewer viewer(User user, GroupPermission... permissions) {
        // the manager also sees the assets it chooses
        List<GroupPermission> all = new ArrayList<>(List.of(permissions));
        if (permissions.length > 0) {
            all.add(GroupPermission.builder().resourceType(PermissionResourceType.ASSET).area(area).canView(true).build());
        }
        return new TaskService.Viewer(user, new AccessContext(false, all), Set.of());
    }
}
