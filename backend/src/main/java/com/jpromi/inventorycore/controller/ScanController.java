package com.jpromi.inventorycore.controller;

import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.ScanResult;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.PermissionService;
import com.jpromi.inventorycore.service.ScanResolver;

/** Looks up a scanned barcode for the scan page (see {@link ScanResolver} for the rules). */
@RestController
@RequestMapping("/api/scan")
public class ScanController {

    private final ScanResolver resolver;
    private final PermissionService permissionService;
    private final ApiMapper mapper;

    public ScanController(ScanResolver resolver, PermissionService permissionService, ApiMapper mapper) {
        this.resolver = resolver;
        this.permissionService = permissionService;
        this.mapper = mapper;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ScanResult scan(@RequestParam String code, Authentication authentication) {
        ScanResolver.Resolution resolution = resolver.resolve(permissionService.context(authentication), code);
        return new ScanResult(
            resolution.code(),
            resolution.matchedBy(),
            resolution.assets().stream().map(mapper::toResponse).toList(),
            resolution.locations().stream().map(mapper::toResponse).toList()
        );
    }
}
