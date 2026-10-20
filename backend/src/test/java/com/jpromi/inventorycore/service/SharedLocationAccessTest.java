package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.enums.PermissionResourceType;

/** A store room that EDV and Zeugmeister use together: each sees only its own things in it. */
class SharedLocationAccessTest {

    private final Area edv = Area.builder().id(1L).name("EDV").build();
    private final Area zeugmeister = Area.builder().id(2L).name("Zeugmeister").build();

    private final Location storeRoom = Location.builder().id(10L).name("Lager Test")
        .areas(Set.of(edv, zeugmeister)).childLocations(new ArrayList<>()).assets(new ArrayList<>()).build();
    private final Location edvShelf = Location.builder().id(11L).name("Regal EDV")
        .areas(Set.of(edv)).parentLocation(storeRoom).childLocations(new ArrayList<>()).assets(new ArrayList<>()).build();
    private final Asset laptop = Asset.builder().id(20L).name("Laptop").invId("FW-1").areas(Set.of(edv)).location(storeRoom).build();
    private final Asset hose = Asset.builder().id(21L).name("Druckschlauch B").invId("FW-2").areas(Set.of(zeugmeister)).location(storeRoom).build();
    private final Asset printer = Asset.builder().id(22L).name("Drucker").invId("FW-3").areas(Set.of(edv)).location(edvShelf).build();

    private static AccessContext viewerOf(Area area) {
        return new AccessContext(false, List.of(
            GroupPermission.builder().resourceType(PermissionResourceType.ASSET).area(area).canView(true).build(),
            GroupPermission.builder().resourceType(PermissionResourceType.LOCATION).area(area).canView(true).build()));
    }

    {
        storeRoom.getChildLocations().add(edvShelf);
        storeRoom.getAssets().addAll(List.of(laptop, hose));
        edvShelf.getAssets().add(printer);
    }

    @Test
    void anOrdinaryLocationShowsEverythingInIt() {
        AccessContext zeug = viewerOf(zeugmeister);
        assertTrue(zeug.canViewLocation(storeRoom));
        assertTrue(zeug.canViewAsset(laptop));
        assertTrue(zeug.canViewLocation(edvShelf));
        assertTrue(zeug.canViewAsset(printer));
    }

    @Test
    void aSharedLocationShowsEachAreaOnlyItsOwnThings() {
        storeRoom.setShared(true);
        AccessContext zeug = viewerOf(zeugmeister);
        AccessContext edvViewer = viewerOf(edv);

        assertTrue(zeug.canViewLocation(storeRoom));
        assertTrue(zeug.canViewAsset(hose));
        assertFalse(zeug.canViewAsset(laptop));
        assertFalse(zeug.canViewLocation(edvShelf));
        assertFalse(zeug.canViewAsset(printer));

        assertTrue(edvViewer.canViewAsset(laptop));
        assertTrue(edvViewer.canViewLocation(edvShelf));
        assertTrue(edvViewer.canViewAsset(printer));
        assertFalse(edvViewer.canViewAsset(hose));

        // admins still see everything
        assertTrue(new AccessContext(true, List.of()).canViewAsset(hose));
    }

    @Test
    void theLocationListsOnlyWhatTheReaderMaySee() {
        storeRoom.setShared(true);
        var forZeugmeister = new ApiMapper().toResponse(storeRoom, viewerOf(zeugmeister));
        assertEquals(List.of(hose.getUuid()), forZeugmeister.assetUuids());
        assertTrue(forZeugmeister.childLocationUuids().isEmpty());
        assertTrue(forZeugmeister.shared());

        var forEdv = new ApiMapper().toResponse(storeRoom, viewerOf(edv));
        assertEquals(List.of(laptop.getUuid()), forEdv.assetUuids());
        assertEquals(List.of(edvShelf.getUuid()), forEdv.childLocationUuids());
    }
}
