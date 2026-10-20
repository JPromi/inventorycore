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
    SYNC,
    /** Sign-in (object: the user), with way of signing in, IP address and user agent. */
    LOGIN,
    /** Rejected sign-in (object: the account with that user name, if there is one). */
    LOGIN_FAILED,
    LOGOUT
}
