package com.jpromi.inventorycore.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.StorageUsageResponse;
import com.jpromi.inventorycore.files.StorageUsageService;

/** Storage used by the database and the uploads; administrators only (see SecurityConfig for /api/admin). */
@RestController
@RequestMapping("/api/admin/storage")
public class StorageController {

    private final StorageUsageService usage;

    public StorageController(StorageUsageService usage) {
        this.usage = usage;
    }

    @GetMapping
    public StorageUsageResponse usage() {
        return usage.usage();
    }
}
