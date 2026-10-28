package com.jpromi.inventorycore.entity;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Defaults for the label editor, edited by admins. There is only one row (id 1). */
@Getter
@Setter
@Entity
@Table(name = "label_settings")
@NoArgsConstructor
public class LabelSettings {

    public static final long SINGLETON_ID = 1L;
    public static final double DEFAULT_SAFE_AREA_MM = 5;

    @Id
    private Long id = SINGLETON_ID;

    /** Margin new templates start with; no element may be placed inside it. */
    @Column(nullable = false)
    private double safeAreaMm = DEFAULT_SAFE_AREA_MM;

    /** Sizes offered in the label editor, in this order. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "label_size_presets", joinColumns = @JoinColumn(name = "label_settings_id"))
    @OrderColumn(name = "position")
    private List<LabelSizePreset> sizePresets = defaultSizePresets();

    public static List<LabelSizePreset> defaultSizePresets() {
        return new ArrayList<>(List.of(
            new LabelSizePreset("62 × 29 mm (Brother DK-11209)", 62, 29),
            new LabelSizePreset("62 × 100 mm (Brother DK-11202)", 62, 100),
            new LabelSizePreset("29 × 90 mm (Brother DK-11201)", 90, 29),
            new LabelSizePreset("50 × 25 mm", 50, 25),
            new LabelSizePreset("57 × 32 mm (Dymo 11354)", 57, 32),
            new LabelSizePreset("89 × 36 mm (Dymo 99012)", 89, 36),
            new LabelSizePreset("100 × 50 mm", 100, 50),
            new LabelSizePreset("24 mm Band, 60 mm lang", 60, 24)
        ));
    }
}
