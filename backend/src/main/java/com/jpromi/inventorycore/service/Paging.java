package com.jpromi.inventorycore.service;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.Location;

/**
 * Server-side list search and paging. Lists are filtered after the permission checks, so a page
 * never contains (or counts) objects the user may not see.
 */
public final class Paging {
    public static final int DEFAULT_SIZE = 50;
    public static final int MAX_SIZE = 200;

    private Paging() {}

    /** The requested page of the already filtered and sorted list; only that page is mapped. */
    public static <T, R> PageResponse<R> page(List<T> matches, int page, int size, Function<T, R> mapper) {
        int pageSize = Math.min(MAX_SIZE, Math.max(1, size));
        int pageIndex = Math.max(0, page);
        long from = (long) pageIndex * pageSize;
        List<R> items = from >= matches.size() ? List.of()
            : matches.subList((int) from, (int) Math.min(matches.size(), from + pageSize)).stream().map(mapper).toList();
        return new PageResponse<>(items, matches.size(), pageIndex, pageSize, from + items.size() < matches.size());
    }

    /** Search words: every word must occur somewhere (case-insensitive), like the old list search. */
    public static List<String> terms(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return Stream.of(query.trim().toLowerCase(Locale.ROOT).split("\\s+")).filter(term -> !term.isEmpty()).toList();
    }

    public static boolean matches(List<String> terms, Collection<String> values) {
        if (terms.isEmpty()) {
            return true;
        }
        String text = values.stream().filter(Objects::nonNull).collect(Collectors.joining(" ")).toLowerCase(Locale.ROOT);
        return terms.stream().allMatch(text::contains);
    }

    public static boolean matches(List<String> terms, String... values) {
        return matches(terms, java.util.Arrays.asList(values));
    }

    /** The sidebar area selection as a set; empty means "all areas". */
    public static Set<UUID> selection(Collection<UUID> areas) {
        return areas == null ? Set.of() : new HashSet<>(areas);
    }

    /** Objects bound to areas (types, templates, protocols): no selection or no areas matches everything. */
    public static boolean overlaps(Collection<Area> areas, Set<UUID> selected) {
        return selected.isEmpty() || areas.isEmpty() || areas.stream().anyMatch(area -> selected.contains(area.getUuid()));
    }

    /** Same, for objects that only carry area UUIDs. */
    public static boolean overlapsUuids(Collection<UUID> areas, Set<UUID> selected) {
        return selected.isEmpty() || areas == null || areas.isEmpty() || areas.stream().anyMatch(selected::contains);
    }

    /** A location belongs to the selected areas itself or through one of its parents. */
    public static boolean inAreas(Location location, Set<UUID> selected) {
        if (selected.isEmpty()) {
            return true;
        }
        Set<Long> visited = new HashSet<>();
        for (Location current = location; current != null && visited.add(current.getId()); current = current.getParentLocation()) {
            if (current.getAreas().stream().anyMatch(area -> selected.contains(area.getUuid()))) {
                return true;
            }
        }
        return false;
    }

    /** An asset belongs to the selected areas itself or through its location (and that location's parents). */
    public static boolean inAreas(Asset asset, Set<UUID> selected) {
        if (selected.isEmpty() || asset.getAreas().stream().anyMatch(area -> selected.contains(area.getUuid()))) {
            return true;
        }
        return asset.getLocation() != null && inAreas(asset.getLocation(), selected);
    }

    /** The location itself or one of its parents is {@code ancestor}. */
    public static boolean within(Location location, UUID ancestor) {
        Set<Long> visited = new HashSet<>();
        for (Location current = location; current != null && visited.add(current.getId()); current = current.getParentLocation()) {
            if (current.getUuid().equals(ancestor)) {
                return true;
            }
        }
        return false;
    }
}
