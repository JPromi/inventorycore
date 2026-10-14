package com.jpromi.inventorycore.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.jpromi.inventorycore.enums.InspectionItemStatus;
import com.jpromi.inventorycore.enums.IntervalUnit;

/**
 * Due date of one recurring inspection for one asset.
 *
 * <p>{@code state}: OVERDUE (due date passed), DUE (due today or within the next days, also when
 * never checked), OK. {@code fixedDueDate} is set when a fixed date replaces the interval.
 * {@code lastResult} is PRESENT/PASSED or FAILED (defect: due again right away).
 */
public record InspectionDueResponse(
    UUID assetUuid,
    String assetName,
    String invId,
    String assetTypeName,
    String locationName,
    UUID inspectionTypeUuid,
    String inspectionTypeName,
    String inspectionTypeColor,
    Integer intervalValue,
    IntervalUnit intervalUnit,
    OffsetDateTime lastCheckedAt,
    String lastCheckedByName,
    InspectionItemStatus lastResult,
    LocalDate nextDueDate,
    LocalDate fixedDueDate,
    String state,
    long daysUntilDue
) {}
