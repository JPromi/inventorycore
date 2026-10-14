package com.jpromi.inventorycore.controller;

import java.util.Comparator;
import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AreaResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.PermissionService;

/** Areas the current user has access to (for the area switcher and area pickers). */
@RestController
@RequestMapping("/api/areas")
public class AreaController {

    private final AreaRepository areaRepository;
    private final PermissionService permissionService;
    private final ApiMapper mapper;

    public AreaController(AreaRepository areaRepository, PermissionService permissionService, ApiMapper mapper) {
        this.areaRepository = areaRepository;
        this.permissionService = permissionService;
        this.mapper = mapper;
    }

    @GetMapping
    public List<AreaResponse> areas(Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        return areaRepository.findAll().stream()
            .filter(access::hasAccessTo)
            .sorted(Comparator.comparing(Area::isDefaultArea).reversed().thenComparing(Area::getName, String.CASE_INSENSITIVE_ORDER))
            .map(area -> mapper.toResponse(area, null, null, null))
            .toList();
    }
}
