package com.jpromi.inventorycore.dto;

import java.util.List;

public record LabelSettingsDto(double safeAreaMm, List<SizePreset> sizePresets) {

    /** {@code safeAreaMm} null = the general {@link LabelSettingsDto#safeAreaMm()}. */
    public record SizePreset(String name, double widthMm, double heightMm, Double safeAreaMm) {}
}
