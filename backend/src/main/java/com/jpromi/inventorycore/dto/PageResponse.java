package com.jpromi.inventorycore.dto;

import java.util.List;

/** One page of a list; `total` counts all matches, `hasMore` tells whether another page follows. */
public record PageResponse<T>(List<T> items, long total, int page, int size, boolean hasMore) {}
