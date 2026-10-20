package com.jpromi.inventorycore.controller;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.AuditLogPage;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AuditLog;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AuditLogRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.service.PermissionService;

import jakarta.persistence.criteria.Predicate;

/**
 * Reading the activity log: everything for admins, the history of a single asset or location for
 * everyone who may see it.
 */
@RestController
@RequestMapping("/api")
public class AuditController {

    private static final int MAX_PAGE_SIZE = 200;

    private final AuditLogRepository repository;
    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;
    private final PermissionService permissionService;

    public AuditController(
        AuditLogRepository repository,
        AssetRepository assetRepository,
        LocationRepository locationRepository,
        PermissionService permissionService
    ) {
        this.repository = repository;
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
        this.permissionService = permissionService;
    }

    /** All entries, filtered; {@code search} looks in object, user and details. Admins only. */
    @GetMapping("/audit-logs")
    @Transactional(readOnly = true)
    public AuditLogPage logs(
        @RequestParam(required = false) AuditObjectType objectType,
        @RequestParam(required = false) AuditAction action,
        @RequestParam(required = false) UUID objectUuid,
        @RequestParam(required = false) UUID userUuid,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) LocalDate from,
        @RequestParam(required = false) LocalDate to,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        PermissionService.require(access.isAdmin());

        Specification<AuditLog> filter = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (objectType != null) {
                predicates.add(cb.equal(root.get("objectType"), objectType));
            }
            if (action != null) {
                predicates.add(cb.equal(root.get("action"), action));
            }
            if (objectUuid != null) {
                predicates.add(cb.equal(root.get("objectUuid"), objectUuid));
            }
            if (userUuid != null) {
                predicates.add(cb.equal(root.get("userUuid"), userUuid));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime()));
            }
            if (to != null) {
                predicates.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime()));
            }
            if (search != null && !search.isBlank()) {
                String term = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                    cb.like(cb.lower(root.get("objectName")), term),
                    cb.like(cb.lower(root.get("userName")), term),
                    cb.like(cb.lower(root.get("details")), term)
                ));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        Page<AuditLog> result = repository.findAll(filter, pageRequest(page, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"))));
        return toPage(result, page, size);
    }

    /** History of one asset: edits, scans, inspection results, photos. */
    @GetMapping("/assets/{uuid}/logs")
    @Transactional(readOnly = true)
    public AuditLogPage assetLogs(
        @PathVariable UUID uuid,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        Asset asset = assetRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset nicht gefunden"));
        if (!access.canViewAsset(asset)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset nicht gefunden");
        }
        if (access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, asset.getAreas())) {
            return toPage(repository.findByObjectUuidOrderByCreatedAtDescIdDesc(uuid, pageRequest(page, size, Sort.unsorted())), page, size);
        }
        // without the right to inspect: no inspection results, protocol photos or inspection scans
        // (they name protocols and photo files that are only shown to inspectors)
        Specification<AuditLog> filter = (root, query, cb) -> cb.and(
            cb.equal(root.get("objectUuid"), uuid),
            root.get("action").in(AuditAction.INSPECT, AuditAction.PHOTO).not(),
            cb.not(cb.and(cb.equal(root.get("action"), AuditAction.SCAN), cb.like(root.get("details"), "%INSPECTION_SCAN%"))));
        return toPage(repository.findAll(filter, pageRequest(page, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")))), page, size);
    }

    /** Sign-ins, failed sign-ins and sign-outs of one user with IP address and browser. Admins only. */
    @GetMapping("/admin/users/{uuid}/logins")
    @Transactional(readOnly = true)
    public AuditLogPage userLogins(
        @PathVariable UUID uuid,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        Authentication authentication
    ) {
        PermissionService.require(permissionService.context(authentication).isAdmin());
        Specification<AuditLog> filter = (root, query, cb) -> cb.and(
            cb.equal(root.get("objectType"), AuditObjectType.USER),
            cb.equal(root.get("objectUuid"), uuid),
            root.get("action").in(AuditAction.LOGIN, AuditAction.LOGIN_FAILED, AuditAction.LOGOUT));
        return toPage(repository.findAll(filter, pageRequest(page, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")))), page, size);
    }

    @GetMapping("/locations/{uuid}/logs")
    @Transactional(readOnly = true)
    public AuditLogPage locationLogs(
        @PathVariable UUID uuid,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        Location location = locationRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Standort nicht gefunden"));
        if (!access.canViewLocation(location)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Standort nicht gefunden");
        }
        return toPage(repository.findByObjectUuidOrderByCreatedAtDescIdDesc(uuid, pageRequest(page, size, Sort.unsorted())), page, size);
    }

    private static PageRequest pageRequest(int page, int size, Sort sort) {
        return PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE), sort);
    }

    private static AuditLogPage toPage(Page<AuditLog> result, int page, int size) {
        return new AuditLogPage(result.getContent().stream().map(AuditService::toResponse).toList(), result.getTotalElements(), page, size);
    }
}
