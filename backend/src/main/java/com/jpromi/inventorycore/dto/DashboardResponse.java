package com.jpromi.inventorycore.dto;

import java.util.List;
import java.util.UUID;

/**
 * Overview for the dashboard, limited to what the user may see and to the sidebar area selection.
 * The inspection parts are empty (and {@code canInspect} false) for users without the right to inspect.
 */
public record DashboardResponse(
    long assetCount,
    long locationCount,
    long assetTypeCount,
    /** distinct tags of the assets in the selection (own and inherited from the type) */
    long tagCount,
    boolean canInspect,
    DueCounts due,
    /** recurring inspections, most urgent first (overdue, then the next due dates) */
    List<InspectionDueResponse> nextDue,
    long openInspectionCount,
    /** completed within the last {@link #RECENT_DAYS} days */
    long completedInspectionCount,
    /** completed inspections, newest first */
    List<InspectionSummaryResponse> recentInspections,
    /** results of the inspections completed within the last {@link #RESULT_DAYS} days */
    ResultCounts results,
    /** most used tags; {@code count} = assets with the tag */
    List<CountEntry> topTags,
    /** asset types with the most assets; an entry without uuid/name stands for assets without type */
    List<CountEntry> assetsByType,
    /** assets of all further types that are not listed in {@code assetsByType} */
    long otherTypeAssetCount
) {
    public static final int RECENT_DAYS = 30;
    public static final int RESULT_DAYS = 90;

    /** Recurring due dates of the assets in the selection by state (OVERDUE / DUE / OK). */
    public record DueCounts(long overdue, long dueSoon, long ok) {}

    /**
     * Checked assets: {@code ok} = present (inventory) or passed (single check) without defect,
     * {@code defect} = present but defect, {@code missing}, {@code failed}.
     */
    public record ResultCounts(long ok, long defect, long missing, long failed) {}

    public record CountEntry(UUID uuid, String name, String color, long count) {}
}
