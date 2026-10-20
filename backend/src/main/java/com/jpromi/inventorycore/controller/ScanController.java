package com.jpromi.inventorycore.controller;

import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.dto.ScanResult;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.service.PermissionService;
import com.jpromi.inventorycore.service.ScanResolver;

/** Looks up a scanned barcode for the scan page (see {@link ScanResolver} for the rules). */
@RestController
@RequestMapping("/api/scan")
public class ScanController {

    private final ScanResolver resolver;
    private final PermissionService permissionService;
    private final ApiMapper mapper;
    private final AuditService audit;

    public ScanController(ScanResolver resolver, PermissionService permissionService, ApiMapper mapper, AuditService audit) {
        this.resolver = resolver;
        this.permissionService = permissionService;
        this.mapper = mapper;
        this.audit = audit;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ScanResult scan(@RequestParam String code, Authentication authentication) {
        com.jpromi.inventorycore.service.AccessContext access = permissionService.context(authentication);
        ScanResolver.Resolution resolution = resolver.resolve(access, code);
        AuditDetail detail = AuditDetail.event("SCAN_PAGE", "code", resolution.code(), "matchedBy", resolution.matchedBy());
        resolution.assets().forEach(asset -> audit.log(AuditAction.SCAN, AuditObjectType.ASSET, asset.getUuid(), asset.getName(), detail));
        resolution.locations().forEach(location -> audit.log(AuditAction.SCAN, AuditObjectType.LOCATION, location.getUuid(), location.getName(), detail));
        return new ScanResult(
            resolution.code(),
            resolution.matchedBy(),
            resolution.assets().stream().map(mapper::toResponse).toList(),
            resolution.locations().stream().map(location -> mapper.toResponse(location, access)).toList()
        );
    }
}
