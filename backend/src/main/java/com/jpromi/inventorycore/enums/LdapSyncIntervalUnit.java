package com.jpromi.inventorycore.enums;

public enum LdapSyncIntervalUnit {
    MINUTES(1), HOURS(60), DAYS(1440);

    private final int minutes;

    LdapSyncIntervalUnit(int minutes) {
        this.minutes = minutes;
    }

    public long toMinutes(int value) {
        return (long) value * minutes;
    }

    public int maxValue() {
        return 525600 / minutes;
    }
}
