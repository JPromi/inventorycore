package com.jpromi.inventorycore.enums;

import java.time.LocalDate;

public enum IntervalUnit {
    DAYS,
    WEEKS,
    MONTHS,
    YEARS;

    public LocalDate addTo(LocalDate date, int amount) {
        return switch (this) {
            case DAYS -> date.plusDays(amount);
            case WEEKS -> date.plusWeeks(amount);
            case MONTHS -> date.plusMonths(amount);
            case YEARS -> date.plusYears(amount);
        };
    }
}
