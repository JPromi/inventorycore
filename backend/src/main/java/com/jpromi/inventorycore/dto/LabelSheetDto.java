package com.jpromi.inventorycore.dto;

/** Grid of labels on a sheet of paper; see {@link com.jpromi.inventorycore.entity.LabelSheet}. */
public record LabelSheetDto(
    double paperWidthMm,
    double paperHeightMm,
    int columns,
    int rows,
    double marginTopMm,
    double marginLeftMm,
    double gapXMm,
    double gapYMm
) {}
