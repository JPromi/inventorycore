package com.jpromi.inventorycore.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.DashboardResponse;
import com.jpromi.inventorycore.service.DashboardService;
import com.jpromi.inventorycore.service.PermissionService;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final DashboardService dashboard;
    private final PermissionService permissionService;

    public DashboardController(DashboardService dashboard, PermissionService permissionService) {
        this.dashboard = dashboard;
        this.permissionService = permissionService;
    }

    /** {@code areas}: the sidebar area selection (repeatable); empty = all visible areas. */
    @GetMapping
    public DashboardResponse dashboard(@RequestParam(required = false) List<UUID> areas, Authentication authentication) {
        return dashboard.dashboard(permissionService.context(authentication), areas);
    }
}
