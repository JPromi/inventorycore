package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.Location;

class PagingTest {

    @Test
    void pagesAreSlicedAndOnlyThePageIsMapped() {
        List<Integer> all = IntStream.range(0, 120).boxed().toList();
        var first = Paging.page(all, 0, 50, value -> "#" + value);
        assertEquals(50, first.items().size());
        assertEquals("#0", first.items().get(0));
        assertEquals(120, first.total());
        assertTrue(first.hasMore());

        var last = Paging.page(all, 2, 50, value -> "#" + value);
        assertEquals(List.of("#100", "#101"), last.items().subList(0, 2));
        assertEquals(20, last.items().size());
        assertFalse(last.hasMore());

        var beyond = Paging.page(all, 9, 50, value -> { throw new AssertionError("not mapped"); });
        assertTrue(beyond.items().isEmpty());
        assertFalse(beyond.hasMore());
    }

    @Test
    void pageSizeAndIndexAreClamped() {
        List<Integer> all = IntStream.range(0, 500).boxed().toList();
        assertEquals(Paging.MAX_SIZE, Paging.page(all, 0, 10_000, value -> value).items().size());
        assertEquals(1, Paging.page(all, 0, 0, value -> value).items().size());
        assertEquals(0, Paging.page(all, -3, 10, value -> value).page());
    }

    @Test
    void everySearchWordMustOccurIgnoringCase() {
        var terms = Paging.terms("  laptop  Wien ");
        assertEquals(List.of("laptop", "wien"), terms);
        assertTrue(Paging.matches(terms, "Laptop Max", null, "Büro Wien"));
        assertFalse(Paging.matches(terms, "Laptop Max", "Graz"));
        assertTrue(Paging.matches(Paging.terms(""), "anything"));
    }

    @Test
    void areaSelectionIncludesLocationsAndTheirParents() {
        Area edv = Area.builder().name("EDV").build();
        Area facility = Area.builder().name("Facility").build();
        Location building = Location.builder().id(1L).name("Gebäude").areas(Set.of(edv)).build();
        Location room = Location.builder().id(2L).name("Raum").parentLocation(building).build();
        Asset inRoom = Asset.builder().name("PC").location(room).build();
        Asset own = Asset.builder().name("Drucker").areas(Set.of(facility)).build();

        Set<java.util.UUID> selectEdv = Set.of(edv.getUuid());
        assertTrue(Paging.inAreas(room, selectEdv));
        assertTrue(Paging.inAreas(inRoom, selectEdv));
        assertFalse(Paging.inAreas(own, selectEdv));
        assertTrue(Paging.inAreas(own, Set.of()));
        assertTrue(Paging.within(room, building.getUuid()));
        assertFalse(Paging.within(building, room.getUuid()));

        assertTrue(Paging.overlaps(Set.of(), selectEdv), "objects without areas belong to every selection");
        assertFalse(Paging.overlaps(Set.of(facility), selectEdv));
    }

    @Test
    void parentCyclesDoNotHang() {
        Location a = Location.builder().id(1L).name("A").build();
        Location b = Location.builder().id(2L).name("B").parentLocation(a).build();
        a.setParentLocation(b);
        assertFalse(Paging.inAreas(a, Set.of(java.util.UUID.randomUUID())));
        assertFalse(Paging.within(a, java.util.UUID.randomUUID()));
    }
}
