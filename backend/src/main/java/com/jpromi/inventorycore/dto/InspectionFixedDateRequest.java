package com.jpromi.inventorycore.dto;

import java.time.LocalDate;

/** null removes the fixed date, so the interval counts again. */
public record InspectionFixedDateRequest(LocalDate fixedDueDate) {}
