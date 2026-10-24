package com.jpromi.inventorycore.controller;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.LabelSettingsDto;
import com.jpromi.inventorycore.entity.LabelSettings;
import com.jpromi.inventorycore.entity.LabelSizePreset;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.repository.LabelSettingsRepository;
import com.jpromi.inventorycore.service.AuditService;

/**
 * Label editor defaults: the safe area new templates start with and the offered label sizes.
 * Everyone who may design labels reads them; only admins change them.
 */
@RestController
public class LabelSettingsController {

    static final double MAX_SAFE_AREA_MM = 50;
    private static final double MAX_SIZE_MM = 1000;
    private static final int MAX_PRESETS = 100;

    private final LabelSettingsRepository repository;
    private final AuditService audit;

    public LabelSettingsController(LabelSettingsRepository repository, AuditService audit) {
        this.repository = repository;
        this.audit = audit;
    }

    @GetMapping({"/api/label-settings", "/api/admin/label-settings"})
    @Transactional(readOnly = true)
    public LabelSettingsDto get() {
        return toDto(repository.load());
    }

    @PutMapping("/api/admin/label-settings")
    @Transactional
    public LabelSettingsDto save(@RequestBody LabelSettingsDto request) {
        double safeArea = request.safeAreaMm();
        if (!isSafeArea(safeArea)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Der Sicherheitsabstand muss zwischen 0 und " + (int) MAX_SAFE_AREA_MM + " mm liegen.");
        }
        List<LabelSettingsDto.SizePreset> presets = request.sizePresets() == null ? List.of() : request.sizePresets();
        if (presets.size() > MAX_PRESETS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Es sind höchstens " + MAX_PRESETS + " Label-Größen möglich.");
        }
        List<LabelSizePreset> sizes = new ArrayList<>();
        for (LabelSettingsDto.SizePreset preset : presets) {
            String name = preset.name() == null ? "" : preset.name().trim();
            if (name.isEmpty() || name.length() > 100) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Jede Label-Größe braucht einen Namen mit höchstens 100 Zeichen.");
            }
            if (!isSize(preset.widthMm()) || !isSize(preset.heightMm())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Breite und Höhe von „" + name + "“ müssen größer als 0 und höchstens " + (int) MAX_SIZE_MM + " mm sein.");
            }
            Double presetSafeArea = preset.safeAreaMm();
            if (presetSafeArea != null && (!isSafeArea(presetSafeArea)
                || 2 * presetSafeArea + 1 > Math.min(preset.widthMm(), preset.heightMm()))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Der Sicherheitsabstand von „" + name + "“ ist für diese Größe zu groß.");
            }
            sizes.add(new LabelSizePreset(name, preset.widthMm(), preset.heightMm(), presetSafeArea));
        }
        LabelSettings settings = repository.load();
        LabelSettingsDto before = toDto(settings);
        settings.setSafeAreaMm(safeArea);
        settings.getSizePresets().clear();
        settings.getSizePresets().addAll(sizes);
        LabelSettingsDto after = toDto(repository.save(settings));
        audit.logChanges(AuditObjectType.SETTINGS, null, "Label-Einstellungen", before, after);
        return after;
    }

    private static boolean isSafeArea(double value) {
        return Double.isFinite(value) && value >= 0 && value <= MAX_SAFE_AREA_MM;
    }

    private static boolean isSize(double value) {
        return Double.isFinite(value) && value > 0 && value <= MAX_SIZE_MM;
    }

    private static LabelSettingsDto toDto(LabelSettings settings) {
        return new LabelSettingsDto(settings.getSafeAreaMm(), settings.getSizePresets().stream()
            .map(preset -> new LabelSettingsDto.SizePreset(
                preset.getName(), preset.getWidthMm(), preset.getHeightMm(), preset.getSafeAreaMm()))
            .toList());
    }
}
