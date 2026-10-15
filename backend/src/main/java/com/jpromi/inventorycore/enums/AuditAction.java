package com.jpromi.inventorycore.enums;

/** What was done in an activity log entry. */
public enum AuditAction {
    CREATE,
    UPDATE,
    DELETE,
    /** Code read on the scan page or in an inspection. */
    SCAN,
    /** Result set in an inspection (present / missing / in order / defect). */
    INSPECT,
    PHOTO,
    /** Inspection completed. */
    COMPLETE,
    /** LDAP synchronization and similar runs. */
    SYNC
}
