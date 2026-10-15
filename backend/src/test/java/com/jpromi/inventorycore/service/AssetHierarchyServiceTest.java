package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.repository.AssetRepository;

class AssetHierarchyServiceTest {
    private final AssetRepository assets = mock(AssetRepository.class);
    private final AssetHierarchyService service = new AssetHierarchyService(assets);
    private final AccessContext access = mock(AccessContext.class);

    @Test
    void storesTheLinkNoteAndSupportsMovingAndUnlinking() {
        var child = Asset.builder().name("RAM").build();
        var parent = Asset.builder().name("PC").build();
        var other = Asset.builder().name("Server").build();
        for (var asset : new Asset[] {parent, other}) {
            when(assets.findByUuid(asset.getUuid())).thenReturn(Optional.of(asset));
            when(access.canViewAsset(asset)).thenReturn(true);
        }
        service.assign(access, child, parent.getUuid(), " RAM Slot 1 ");
        assertSame(parent, child.getParentAsset());
        assertEquals("RAM Slot 1", child.getParentAssetNote());
        service.assign(access, child, other.getUuid(), "Slot 2");
        assertSame(other, child.getParentAsset());
        service.assign(access, child, null, "ignored");
        assertNull(child.getParentAsset());
        assertNull(child.getParentAssetNote());
    }

    @Test
    void rejectsSelfLinksAndCyclesAtAnyDepth() {
        var root = Asset.builder().build();
        var child = Asset.builder().parentAsset(root).build();
        var grandchild = Asset.builder().parentAsset(child).build();
        for (var parent : new Asset[] {root, child, grandchild}) {
            when(assets.findByUuid(parent.getUuid())).thenReturn(Optional.of(parent));
            when(access.canViewAsset(parent)).thenReturn(true);
            assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.assign(access, root, parent.getUuid(), null)).getStatusCode());
        }
        assertNull(root.getParentAsset());
    }

    @Test
    void rejectsHiddenDeletedAndMissingParentsAndOverlongNotes() {
        var child = Asset.builder().build();
        var parent = Asset.builder().build();
        when(assets.findByUuid(parent.getUuid())).thenReturn(Optional.of(parent));
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> service.assign(access, child, parent.getUuid(), null)).getStatusCode());
        when(access.canViewAsset(parent)).thenReturn(true);
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
            () -> service.assign(access, child, parent.getUuid(), "x".repeat(1001))).getStatusCode());
        parent.setDeleted(true);
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
            () -> service.assign(access, child, parent.getUuid(), null)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
            () -> service.assign(access, child, java.util.UUID.randomUUID(), null)).getStatusCode());
        assertNull(child.getParentAsset());
    }

    @Test
    void blocksParentDeletionUntilLiveChildrenAreUnlinked() {
        var parent = Asset.builder().build();
        when(assets.existsByParentAssetAndDeletedFalse(parent)).thenReturn(true);
        assertEquals(HttpStatus.CONFLICT,
            assertThrows(ResponseStatusException.class, () -> service.requireNoChildren(parent)).getStatusCode());
        when(assets.existsByParentAssetAndDeletedFalse(parent)).thenReturn(false);
        assertDoesNotThrow(() -> service.requireNoChildren(parent));
    }
}
