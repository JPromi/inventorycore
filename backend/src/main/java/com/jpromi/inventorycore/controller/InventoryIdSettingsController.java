package com.jpromi.inventorycore.controller;

import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.entity.InventoryIdSettings;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.repository.*;
import com.jpromi.inventorycore.service.*;

@RestController
@RequestMapping("/api/admin/inventory-id-settings")
public class InventoryIdSettingsController {
    public record Settings(String pattern) {}
    public record RegenerateRequest(String pattern, boolean confirmed) {}
    public record Result(int count) {}
    public record IdChange(String invId) {}
    private final InventoryIdSettingsRepository settings;
    private final AssetRepository assets;
    private final InventoryIdService generator;
    private final AuditService audit;
    public InventoryIdSettingsController(InventoryIdSettingsRepository settings, AssetRepository assets, InventoryIdService generator, AuditService audit) {
        this.settings = settings; this.assets = assets; this.generator = generator; this.audit = audit;
    }
    @GetMapping
    public Settings get() { return new Settings(generator.pattern()); }
    @PutMapping
    @Transactional
    public Settings save(@RequestBody Settings request) {
        generator.lockAllocation();
        generator.validate(request.pattern());
        Settings before = get();
        InventoryIdSettings value = settings.findById(1L).orElseGet(InventoryIdSettings::new);
        value.setPattern(request.pattern()); settings.save(value);
        audit.logChanges(AuditObjectType.SETTINGS, null, "Inventar-ID", before, request);
        return request;
    }
    @PostMapping("/regenerate")
    @Transactional
    public Result regenerate(@RequestBody RegenerateRequest request) {
        generator.lockAllocation();
        if (!request.confirmed() || !Objects.equals(request.pattern(), generator.pattern()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bitte speichern Sie das Muster und bestätigen Sie die Neugenerierung erneut.");
        String pattern = generator.pattern();
        generator.validate(pattern);
        var all = assets.findAll();
        // Reserve old IDs too: printed codes must never point to a different asset.
        Set<String> reserved = new HashSet<>();
        all.forEach(asset -> {
            reserved.add(asset.getInvId().toLowerCase(Locale.ROOT));
            if (asset.getInventoryNumber() != null) reserved.add(asset.getInventoryNumber().toLowerCase(Locale.ROOT));
            if (asset.getSerialNumber() != null) reserved.add(asset.getSerialNumber().toLowerCase(Locale.ROOT));
        });
        Map<Long, String> replacements = new HashMap<>();
        for (var asset : all) {
            if (asset.isDeleted()) continue;
            String next = generator.generate(pattern, value -> reserved.contains(value.toLowerCase(Locale.ROOT)));
            reserved.add(next.toLowerCase(Locale.ROOT)); replacements.put(asset.getId(), next);
        }
        for (var asset : all) {
            String next = replacements.get(asset.getId());
            if (next == null) continue;
            IdChange before = new IdChange(asset.getInvId());
            asset.setInvId(next);
            audit.logChanges(AuditObjectType.ASSET, asset.getUuid(), asset.getName(), before, new IdChange(next));
        }
        assets.flush();
        return new Result(replacements.size());
    }
}
