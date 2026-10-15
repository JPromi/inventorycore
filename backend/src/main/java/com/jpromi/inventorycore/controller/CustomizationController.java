package com.jpromi.inventorycore.controller;

import java.io.IOException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.jpromi.inventorycore.dto.CustomizationDto;
import com.jpromi.inventorycore.service.CustomizationService;
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.enums.AuditObjectType;

@RestController
public class CustomizationController {
    private final CustomizationService service;
    private final AuditService audit;

    public CustomizationController(CustomizationService service, AuditService audit) { this.service = service; this.audit = audit; }

    @GetMapping({"/api/customization", "/api/admin/customization"})
    public CustomizationDto get() { return service.get(); }

    @PutMapping("/api/admin/customization")
    public CustomizationDto save(@RequestBody CustomizationDto request) {
        var before = service.get();
        var result = service.save(request);
        audit.logChanges(AuditObjectType.SETTINGS, null, "Customization", before, result);
        return result;
    }

    @PostMapping(value = "/api/admin/customization/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CustomizationDto upload(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.getSize() > 5 * 1024 * 1024) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Das Logo darf maximal 5 MB groß sein.");
        }
        var before = service.get();
        var result = service.logo(file.getBytes());
        audit.logChanges(AuditObjectType.SETTINGS, null, "Customization", before, result);
        return result;
    }

    @DeleteMapping("/api/admin/customization/logo")
    public CustomizationDto removeLogo() {
        var before = service.get();
        var result = service.removeLogo();
        audit.logChanges(AuditObjectType.SETTINGS, null, "Customization", before, result);
        return result;
    }

    @GetMapping("/api/customization/logo")
    public ResponseEntity<byte[]> logo() { return service.image(); }
}
