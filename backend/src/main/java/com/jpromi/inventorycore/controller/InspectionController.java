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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AuditDetail;
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
import com.jpromi.inventorycore.dto.InspectionPageResponse;
import com.jpromi.inventorycore.dto.InspectionPhotoRequest;
import com.jpromi.inventorycore.dto.InspectionScanRequest;
import com.jpromi.inventorycore.dto.InspectionScanResponse;
import com.jpromi.inventorycore.dto.InspectionSummaryResponse;
import com.jpromi.inventorycore.dto.InspectionTypeRequest;
import com.jpromi.inventorycore.dto.InspectionTypeResponse;
import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.enums.InspectionStatus;
import com.jpromi.inventorycore.service.Paging;
import com.jpromi.inventorycore.service.InspectionScheduleService;
import com.jpromi.inventorycore.service.InspectionService;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.service.PermissionService;

@RestController
@RequestMapping("/api")
public class InspectionController {

    private final InspectionService service;
    private final PermissionService permissionService;
    private final InspectionScheduleService scheduleService;
    private final AuditService audit;

    public InspectionController(
        InspectionService service,
        PermissionService permissionService,
        InspectionScheduleService scheduleService,
        AuditService audit
    ) {
        this.service = service;
        this.permissionService = permissionService;
        this.scheduleService = scheduleService;
        this.audit = audit;
    }

    // ---- types ----

    @GetMapping("/inspection-types")
    public List<InspectionTypeResponse> types(Authentication authentication) {
        return service.types(permissionService.context(authentication));
    }

    /** Searched and paged for the template list; `areas` is the sidebar selection. */
    @GetMapping("/inspection-types/page")
    public PageResponse<InspectionTypeResponse> typePage(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) List<UUID> areas,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        List<String> terms = Paging.terms(q);
        var selection = Paging.selection(areas);
        List<InspectionTypeResponse> matches = service.types(permissionService.context(authentication)).stream()
            .filter(type -> Paging.overlapsUuids(type.areaUuids(), selection))
            .filter(type -> Paging.matches(terms, java.util.stream.Stream.concat(
                java.util.stream.Stream.of(type.name(), type.description()), type.assetTypeNames().stream()).toList()))
            .toList();
        return Paging.page(matches, page, size, type -> type);
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

    /** Protocols, newest first, searched and paged; the tab counts ignore search and status. */
    @GetMapping("/inspections/page")
    public InspectionPageResponse inspectionPage(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) InspectionStatus status,
        @RequestParam(required = false) List<UUID> areas,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        List<String> terms = Paging.terms(q);
        var selection = Paging.selection(areas);
        List<InspectionSummaryResponse> inArea = service.inspections(permissionService.context(authentication)).stream()
            .filter(inspection -> Paging.overlapsUuids(inspection.areaUuids(), selection))
            .toList();
        List<InspectionSummaryResponse> matches = inArea.stream()
            .filter(inspection -> status == null || inspection.status() == status)
            .filter(inspection -> Paging.matches(terms, inspection.title(), inspection.typeName(), inspection.filterSummary(), inspection.createdByName()))
            .toList();
        PageResponse<InspectionSummaryResponse> result = Paging.page(matches, page, size, inspection -> inspection);
        return new InspectionPageResponse(result.items(), result.total(), result.page(), result.size(), result.hasMore(),
            inArea.stream().filter(inspection -> inspection.status() == InspectionStatus.OPEN).count(),
            inArea.stream().filter(inspection -> inspection.status() == InspectionStatus.COMPLETED).count());
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
        service.delete(permissionService.context(authentication), permissionService.currentUser(authentication), uuid);
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
        InspectionDueResponse due = scheduleService.setFixedDate(
            permissionService.context(authentication), permissionService.currentUser(authentication), uuid, typeUuid, request.fixedDueDate());
        audit.log(AuditAction.UPDATE, AuditObjectType.ASSET, due.assetUuid(), due.assetName(), AuditDetail.event(
            request.fixedDueDate() == null ? "FIXED_DUE_DATE_REMOVED" : "FIXED_DUE_DATE_SET",
            "inspectionType", due.inspectionTypeName(),
            "date", request.fixedDueDate() == null ? null : request.fixedDueDate().toString()));
        return due;
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
