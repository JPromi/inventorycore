package com.jpromi.inventorycore.dto;

import java.util.List;

/** One page of log entries, newest first. */
public record AuditLogPage(List<AuditLogResponse> items, long total, int page, int size) {}
