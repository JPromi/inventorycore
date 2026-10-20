package com.jpromi.inventorycore.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AssetResponse;
import com.jpromi.inventorycore.dto.AssetTypeResponse;
import com.jpromi.inventorycore.dto.LocationResponse;
import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.dto.TagUsageResponse;
import com.jpromi.inventorycore.enums.LocationType;
import com.jpromi.inventorycore.service.Paging;
import com.jpromi.inventorycore.service.InventoryListService;

@RestController
@RequestMapping("/api")
public class InventoryListController {
    private final InventoryListService lists;

    public InventoryListController(InventoryListService lists) {
        this.lists = lists;
    }

    @GetMapping("/assets/page")
    public PageResponse<AssetResponse> assets(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) UUID tag,
        @RequestParam(required = false) UUID location,
        @RequestParam(required = false) UUID assetType,
        @RequestParam(required = false) UUID area,
        @RequestParam(required = false) List<UUID> areas,
        @RequestParam(required = false) List<UUID> status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        return lists.assets(q, tag, location, assetType, area, areas, status, page, size, authentication);
    }

    @GetMapping("/locations/page")
    public PageResponse<LocationResponse> locations(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) LocationType type,
        @RequestParam(required = false) UUID area,
        @RequestParam(required = false) List<UUID> areas,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        return lists.locations(q, type, area, areas, page, size, authentication);
    }

    @GetMapping("/asset-types/page")
    public PageResponse<AssetTypeResponse> assetTypes(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) UUID area,
        @RequestParam(required = false) List<UUID> areas,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        return lists.assetTypes(q, area, areas, page, size, authentication);
    }

    @GetMapping("/tags/page")
    public PageResponse<TagUsageResponse> tags(
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        return lists.tags(q, page, size, authentication);
    }

}
