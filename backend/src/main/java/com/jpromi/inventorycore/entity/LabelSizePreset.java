package com.jpromi.inventorycore.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A label size the label editor offers for selection, e.g. "62 × 29 mm (Brother DK-11209)". */
@Getter
@Setter
@Embeddable
@NoArgsConstructor
@AllArgsConstructor
public class LabelSizePreset {

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private double widthMm;

    @Column(nullable = false)
    private double heightMm;

    /** Safe area for this size; null = the general default of the label settings. */
    private Double safeAreaMm;

    public LabelSizePreset(String name, double widthMm, double heightMm) {
        this(name, widthMm, heightMm, null);
    }
}
