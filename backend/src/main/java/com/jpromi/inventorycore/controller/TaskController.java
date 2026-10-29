package com.jpromi.inventorycore.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.dto.TaskDtos.AssigneeOptions;
import com.jpromi.inventorycore.dto.TaskDtos.CompleteRequest;
import com.jpromi.inventorycore.dto.TaskDtos.EntryResponse;
import com.jpromi.inventorycore.dto.TaskDtos.EntryUpdateRequest;
import com.jpromi.inventorycore.dto.TaskDtos.PreviewRequest;
import com.jpromi.inventorycore.dto.TaskDtos.PreviewResponse;
import com.jpromi.inventorycore.dto.TaskDtos.RunDetail;
import com.jpromi.inventorycore.dto.TaskDtos.RunPage;
import com.jpromi.inventorycore.dto.TaskDtos.RunSummary;
import com.jpromi.inventorycore.dto.TaskDtos.TaskRequest;
import com.jpromi.inventorycore.dto.TaskDtos.TaskResponse;
import com.jpromi.inventorycore.service.Paging;
import com.jpromi.inventorycore.service.PermissionService;
import com.jpromi.inventorycore.service.TaskService;

/** Tasks (definitions with checklist, assignees and schedule) and their runs; see {@link TaskService}. */
@RestController
@RequestMapping("/api")
public class TaskController {

    private final TaskService service;
    private final PermissionService permissionService;

    public TaskController(TaskService service, PermissionService permissionService) {
        this.service = service;
        this.permissionService = permissionService;
    }

    private TaskService.Viewer viewer(Authentication authentication) {
        return service.viewer(permissionService.currentUser(authentication), permissionService.context(authentication));
    }

    // ---- tasks ----

    @GetMapping("/tasks/page")
    public PageResponse<TaskResponse> taskPage(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) List<UUID> areas,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        return service.taskPage(viewer(authentication), q, areas, page, size);
    }

    @GetMapping("/tasks/assignees")
    public AssigneeOptions assignees(Authentication authentication) {
        return service.assigneeOptions(viewer(authentication));
    }

    @PostMapping("/tasks/preview")
    public PreviewResponse preview(@RequestBody PreviewRequest request, Authentication authentication) {
        return service.preview(viewer(authentication), request);
    }

    @GetMapping("/tasks/{uuid}")
    public TaskResponse task(@PathVariable UUID uuid, Authentication authentication) {
        return service.task(viewer(authentication), uuid);
    }

    @GetMapping("/tasks/{uuid}/runs")
    public List<RunSummary> runsOfTask(@PathVariable UUID uuid, Authentication authentication) {
        return service.runsOfTask(viewer(authentication), uuid);
    }

    /** Starts the task now; returns the open run if there already is one. */
    @PostMapping("/tasks/{uuid}/runs")
    public RunSummary start(@PathVariable UUID uuid, Authentication authentication) {
        return service.start(viewer(authentication), uuid);
    }

    @PostMapping("/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public TaskResponse create(@RequestBody TaskRequest request, Authentication authentication) {
        return service.create(viewer(authentication), request);
    }

    @PutMapping("/tasks/{uuid}")
    public TaskResponse update(@PathVariable UUID uuid, @RequestBody TaskRequest request, Authentication authentication) {
        return service.update(viewer(authentication), uuid, request);
    }

    @DeleteMapping("/tasks/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID uuid, Authentication authentication) {
        service.delete(viewer(authentication), uuid);
    }

    // ---- runs ----

    /** `tab`: MINE (open, assigned to me; default), OPEN, OVERDUE, COMPLETED or ALL. */
    @GetMapping("/task-runs/page")
    public RunPage runPage(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String tab,
        @RequestParam(required = false) List<UUID> areas,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        return service.runPage(viewer(authentication), q, tab, areas, page, size);
    }

    @GetMapping("/task-runs/{uuid}")
    public RunDetail run(@PathVariable UUID uuid, Authentication authentication) {
        return service.run(viewer(authentication), uuid);
    }

    @PatchMapping("/task-runs/{uuid}/entries/{entryUuid}")
    public EntryResponse updateEntry(
        @PathVariable UUID uuid,
        @PathVariable UUID entryUuid,
        @RequestBody EntryUpdateRequest request,
        Authentication authentication
    ) {
        return service.updateEntry(viewer(authentication), uuid, entryUuid, request);
    }

    @PostMapping("/task-runs/{uuid}/complete")
    public RunDetail complete(@PathVariable UUID uuid, @RequestBody CompleteRequest request, Authentication authentication) {
        return service.complete(viewer(authentication), uuid, request.comment());
    }

    @DeleteMapping("/task-runs/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRun(@PathVariable UUID uuid, Authentication authentication) {
        service.deleteRun(viewer(authentication), uuid);
    }
}
