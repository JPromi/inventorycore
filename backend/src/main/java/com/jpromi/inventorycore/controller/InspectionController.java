package com.jpromi.inventorycore.controller;

import java.util.List;
import java.util.Map;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AssetInspectionResponse;
import com.jpromi.inventorycore.dto.InspectionAddItemRequest;
import com.jpromi.inventorycore.dto.InspectionCompleteRequest;
import com.jpromi.inventorycore.dto.InspectionCreateRequest;
import com.jpromi.inventorycore.dto.InspectionDetailResponse;
import com.jpromi.inventorycore.dto.InspectionDueResponse;
import com.jpromi.inventorycore.dto.InspectionFilter;
import com.jpromi.inventorycore.dto.InspectionFixedDateRequest;
import com.jpromi.inventorycore.dto.InspectionItemResponse;
import com.jpromi.inventorycore.dto.InspectionItemUpdateRequest;
import com.jpromi.inventorycore.dto.InspectionPhotoRequest;
import com.jpromi.inventorycore.dto.InspectionScanRequest;
import com.jpromi.inventorycore.dto.InspectionScanResponse;
import com.jpromi.inventorycore.dto.InspectionSummaryResponse;
import com.jpromi.inventorycore.dto.InspectionTypeRequest;
import com.jpromi.inventorycore.dto.InspectionTypeResponse;
import com.jpromi.inventorycore.service.InspectionScheduleService;
import com.jpromi.inventorycore.service.InspectionService;
import com.jpromi.inventorycore.service.PermissionService;

@RestController
@RequestMapping("/api")
public class InspectionController {

    private final InspectionService service;
    private final PermissionService permissionService;
    private final InspectionScheduleService scheduleService;

    public InspectionController(InspectionService service, PermissionService permissionService, InspectionScheduleService scheduleService) {
        this.service = service;
        this.permissionService = permissionService;
        this.scheduleService = scheduleService;
    }

    // ---- types ----

    @GetMapping("/inspection-types")
    public List<InspectionTypeResponse> types(Authentication authentication) {
        return service.types(permissionService.context(authentication));
    }

    @GetMapping("/inspection-types/{uuid}")
    public InspectionTypeResponse type(@PathVariable UUID uuid, Authentication authentication) {
        return service.type(permissionService.context(authentication), uuid);
    }

    @PostMapping("/inspection-types")
    @ResponseStatus(HttpStatus.CREATED)
    public InspectionTypeResponse createType(@RequestBody InspectionTypeRequest request, Authentication authentication) {
        return service.createType(permissionService.context(authentication), request);
    }

    @PutMapping("/inspection-types/{uuid}")
    public InspectionTypeResponse updateType(@PathVariable UUID uuid, @RequestBody InspectionTypeRequest request, Authentication authentication) {
        return service.updateType(permissionService.context(authentication), uuid, request);
    }

    @DeleteMapping("/inspection-types/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteType(@PathVariable UUID uuid, Authentication authentication) {
        service.deleteType(permissionService.context(authentication), uuid);
    }

    // ---- inspections ----

    @GetMapping("/assets/{uuid}/inspections")
    public List<AssetInspectionResponse> inspectionsOfAsset(@PathVariable UUID uuid, Authentication authentication) {
        return service.inspectionsOfAsset(permissionService.context(authentication), uuid);
    }

    @GetMapping("/inspections")
    public List<InspectionSummaryResponse> inspections(Authentication authentication) {
        return service.inspections(permissionService.context(authentication));
    }

    @PostMapping("/inspections/preview")
    public Map<String, Integer> preview(@RequestBody InspectionCreateRequest request, Authentication authentication) {
        return Map.of("count", service.preview(permissionService.context(authentication), request));
    }

    @PostMapping("/inspections")
    @ResponseStatus(HttpStatus.CREATED)
    public InspectionDetailResponse create(@RequestBody InspectionCreateRequest request, Authentication authentication) {
        return service.create(permissionService.context(authentication), permissionService.currentUser(authentication), request);
    }

    @GetMapping("/inspections/{uuid}")
    public InspectionDetailResponse inspection(@PathVariable UUID uuid, Authentication authentication) {
        return service.inspection(permissionService.context(authentication), uuid);
    }

    @DeleteMapping("/inspections/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID uuid, Authentication authentication) {
        service.delete(permissionService.context(authentication), uuid);
    }

    @PostMapping("/inspections/{uuid}/scan")
    public InspectionScanResponse scan(@PathVariable UUID uuid, @RequestBody InspectionScanRequest request, Authentication authentication) {
        return service.scan(permissionService.context(authentication), permissionService.currentUser(authentication), uuid, request.code());
    }

    @PatchMapping("/inspections/{uuid}/items/{itemUuid}")
    public InspectionItemResponse updateItem(
        @PathVariable UUID uuid,
        @PathVariable UUID itemUuid,
        @RequestBody InspectionItemUpdateRequest request,
        Authentication authentication
    ) {
        return service.updateItem(permissionService.context(authentication), permissionService.currentUser(authentication), uuid, itemUuid, request);
    }

    @PostMapping("/inspections/{uuid}/items")
    public InspectionItemResponse addItem(@PathVariable UUID uuid, @RequestBody InspectionAddItemRequest request, Authentication authentication) {
        return service.addItem(permissionService.context(authentication), uuid, request.assetUuid());
    }

    @PostMapping("/inspections/{uuid}/items/{itemUuid}/photos")
    public InspectionItemResponse addPhoto(
        @PathVariable UUID uuid,
        @PathVariable UUID itemUuid,
        @RequestBody InspectionPhotoRequest request,
        Authentication authentication
    ) {
        return service.addPhoto(permissionService.context(authentication), permissionService.currentUser(authentication), uuid, itemUuid, request);
    }

    @DeleteMapping("/inspections/{uuid}/items/{itemUuid}/photos/{photoUuid}")
    public InspectionItemResponse removePhoto(
        @PathVariable UUID uuid,
        @PathVariable UUID itemUuid,
        @PathVariable UUID photoUuid,
        Authentication authentication
    ) {
        return service.removePhoto(permissionService.context(authentication), uuid, itemUuid, photoUuid);
    }

    // ---- recurring inspections ----

    @GetMapping("/inspection-schedules")
    public List<InspectionDueResponse> schedules(Authentication authentication) {
        return scheduleService.all(permissionService.context(authentication));
    }

    @GetMapping("/assets/{uuid}/inspection-schedules")
    public List<InspectionDueResponse> schedulesOfAsset(@PathVariable UUID uuid, Authentication authentication) {
        return scheduleService.ofAsset(permissionService.context(authentication), uuid);
    }

    @PutMapping("/assets/{uuid}/inspection-schedules/{typeUuid}")
    public InspectionDueResponse setFixedDate(
        @PathVariable UUID uuid,
        @PathVariable UUID typeUuid,
        @RequestBody InspectionFixedDateRequest request,
        Authentication authentication
    ) {
        return scheduleService.setFixedDate(
            permissionService.context(authentication), permissionService.currentUser(authentication), uuid, typeUuid, request.fixedDueDate());
    }

    @DeleteMapping("/inspections/{uuid}/items/{itemUuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeItem(@PathVariable UUID uuid, @PathVariable UUID itemUuid, Authentication authentication) {
        service.removeItem(permissionService.context(authentication), uuid, itemUuid);
    }

    @PostMapping("/inspections/{uuid}/complete")
    public InspectionDetailResponse complete(@PathVariable UUID uuid, @RequestBody InspectionCompleteRequest request, Authentication authentication) {
        return service.complete(permissionService.context(authentication), permissionService.currentUser(authentication), uuid, request.comment());
    }
}
