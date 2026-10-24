package com.jpromi.inventorycore.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Sheet of paper (e.g. A4) the labels of a template are printed on side by side, as a grid of
 * {@code columns} x {@code rows}. Margins are measured from the top left paper corner to the
 * first label, gaps between neighbouring labels. All columns are null for single labels (roll).
 */
@Getter
@Setter
@Embeddable
@NoArgsConstructor
@AllArgsConstructor
public class LabelSheet {

    @Column(name = "sheet_paper_width_mm")
    private Double paperWidthMm;

    @Column(name = "sheet_paper_height_mm")
    private Double paperHeightMm;

    @Column(name = "sheet_columns")
    private Integer columns;

    @Column(name = "sheet_rows")
    private Integer rows;

    @Column(name = "sheet_margin_top_mm")
    private Double marginTopMm;

    @Column(name = "sheet_margin_left_mm")
    private Double marginLeftMm;

    @Column(name = "sheet_gap_x_mm")
    private Double gapXMm;

    @Column(name = "sheet_gap_y_mm")
    private Double gapYMm;
}
