package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.enums.LocationType;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.TagRepository;

class InventoryListServiceTest {
    private final AssetRepository assets = mock(AssetRepository.class);
    private final AssetTypeRepository types = mock(AssetTypeRepository.class);
    private final LocationRepository locations = mock(LocationRepository.class);
    private final TagRepository tags = mock(TagRepository.class);
    private final PermissionService permissions = mock(PermissionService.class);
    private final Authentication authentication = mock(Authentication.class);
    private final ApiMapper mapper = spy(new ApiMapper());
    private final InventoryListService service = new InventoryListService(assets, types, locations, tags, permissions, mapper);
    private final Area visible = Area.builder().id(1L).name("Feuerwehrhaus").build();
    private final Area hidden = Area.builder().id(2L).name("Lager").build();

    private void allowView(PermissionResourceType resource) {
        when(permissions.context(authentication)).thenReturn(new AccessContext(false, List.of(
            GroupPermission.builder().resourceType(resource).area(visible).canView(true).build())));
    }

    @Test
    void assetsFilterPermissionsBeforeSortingTotalsAndPagingAndMapOnlyThePage() {
        allowView(PermissionResourceType.ASSET);
        Asset denied = Asset.builder().name("A").areas(Set.of(hidden)).build();
        Asset last = Asset.builder().name("Zulu").areas(Set.of(visible)).build();
        Asset first = Asset.builder().name("Bravo").areas(Set.of(visible)).build();
        when(assets.findByDeletedFalse()).thenReturn(List.of(last, denied, first));

        var page = service.assets(null, null, null, null, null, null, null, 1, 1, authentication);

        assertEquals(List.of(last.getUuid()), page.items().stream().map(item -> item.uuid()).toList());
        assertEquals(2, page.total());
        assertEquals(1, page.page());
        assertEquals(1, page.size());
        assertFalse(page.hasMore());
        verify(mapper).toResponse(last);
        verify(mapper, never()).toResponse(first);
        verify(mapper, never()).toResponse(denied);
    }

    @Test
    void assetsCombineSidebarAndPageAreasWithLocationAncestryAndInheritedTags() {
        allowView(PermissionResourceType.LOCATION);
        Location parent = Location.builder().id(1L).areas(Set.of(visible)).build();
        Location child = Location.builder().id(2L).parentLocation(parent).build();
        Tag inherited = Tag.builder().name("Atemschutz").build();
        AssetType type = AssetType.builder().tags(Set.of(inherited)).build();
        Asset match = Asset.builder().name("Geraet").location(child).assetType(type).areas(Set.of(hidden)).build();
        Asset wrongTag = Asset.builder().name("Geraet").location(child).build();
        when(assets.findByDeletedFalse()).thenReturn(List.of(match, wrongTag));

        var page = service.assets("geraet atem", inherited.getUuid(), parent.getUuid(), type.getUuid(),
            hidden.getUuid(), List.of(visible.getUuid()), null, 0, 50, authentication);

        assertEquals(List.of(match.getUuid()), page.items().stream().map(item -> item.uuid()).toList());
        assertEquals(1, page.total());
        assertTrue(service.assets(null, null, null, null, java.util.UUID.randomUUID(),
            List.of(visible.getUuid()), null, 0, 50, authentication).items().isEmpty());
    }

    @Test
    void locationsInheritVisibilityAndAreasWhileApplyingTypeAndSearchBeforePaging() {
        allowView(PermissionResourceType.LOCATION);
        Location parent = Location.builder().id(1L).name("Garage").areas(Set.of(visible)).build();
        Location child = Location.builder().id(2L).name("Regal").parentLocation(parent)
            .locationType(LocationType.SHELF).build();
        Location denied = Location.builder().id(3L).name("Regal").areas(Set.of(hidden))
            .locationType(LocationType.SHELF).build();
        when(locations.findByDeletedFalse()).thenReturn(List.of(denied, parent, child));

        var page = service.locations("regal", LocationType.SHELF, visible.getUuid(),
            List.of(visible.getUuid()), 0, 1, authentication);

        assertEquals(1, page.total());
        assertEquals(child.getUuid(), page.items().getFirst().uuid());
        assertFalse(page.hasMore());
    }

    @Test
    void assetTypesRequireTheirOwnAreasEvenWhenGlobalViewIsAllowed() {
        when(permissions.context(authentication)).thenReturn(new AccessContext(false, List.of(
            GroupPermission.builder().resourceType(PermissionResourceType.ASSET_TYPE).canView(true).build())));
        Tag tag = Tag.builder().name("Atemschutz").build();
        AssetType match = AssetType.builder().name("Maske").tags(Set.of(tag)).areas(Set.of(visible)).build();
        AssetType unassigned = AssetType.builder().name("Maske").tags(Set.of(tag)).build();
        AssetType otherArea = AssetType.builder().name("Maske").tags(Set.of(tag)).areas(Set.of(hidden)).build();
        when(types.findByDeletedFalse()).thenReturn(List.of(unassigned, otherArea, match));

        var page = service.assetTypes("maske atem", visible.getUuid(), List.of(visible.getUuid()), 0, 50, authentication);

        assertEquals(1, page.total());
        assertEquals(match.getUuid(), page.items().getFirst().uuid());
        assertTrue(service.assetTypes(null, hidden.getUuid(), List.of(visible.getUuid()), 0, 50, authentication).items().isEmpty());
    }

    @Test
    void tagUsageCountsOnlyVisibleDirectAssignmentsAndKeepsGlobalTags() {
        when(permissions.context(authentication)).thenReturn(new AccessContext(false, List.of(
            GroupPermission.builder().area(visible).canView(true).build())));
        Tag tag = Tag.builder().name("Atemschutz").build();
        Tag unused = Tag.builder().name("Reserve").build();
        AssetType type = AssetType.builder().areas(Set.of(visible)).tags(Set.of(tag)).build();
        Asset direct = Asset.builder().areas(Set.of(visible)).tags(Set.of(tag)).build();
        Asset inheritedOnly = Asset.builder().areas(Set.of(visible)).assetType(type).build();
        Asset denied = Asset.builder().areas(Set.of(hidden)).tags(Set.of(tag)).build();
        AssetType deniedType = AssetType.builder().areas(Set.of(hidden)).tags(Set.of(tag)).build();
        when(tags.findAll()).thenReturn(List.of(unused, tag));
        when(assets.findByDeletedFalse()).thenReturn(List.of(direct, inheritedOnly, denied));
        when(types.findByDeletedFalse()).thenReturn(List.of(type, deniedType));

        var page = service.tags(null, 0, 1, authentication);

        assertEquals(2, page.total());
        assertTrue(page.hasMore());
        assertEquals(tag.getUuid(), page.items().getFirst().uuid());
        assertEquals(1L, page.items().getFirst().assetCount());
        assertEquals(1L, page.items().getFirst().assetTypeCount());
        var second = service.tags(null, 1, 1, authentication);
        assertEquals(unused.getUuid(), second.items().getFirst().uuid());
        assertEquals(0L, second.items().getFirst().assetCount());
    }

    @Test
    void outOfRangeTagPageSkipsUsageQueriesButRetainsTotal() {
        allowView(PermissionResourceType.ASSET);
        when(tags.findAll()).thenReturn(List.of(Tag.builder().name("Reserve").build()));

        var page = service.tags(null, 10, 50, authentication);

        assertTrue(page.items().isEmpty());
        assertEquals(1, page.total());
        assertEquals(10, page.page());
        assertFalse(page.hasMore());
        verifyNoInteractions(assets, types, mapper);
    }

    @Test
    void noMatchingTagsSkipsUsageQueriesAndNormalizesPaging() {
        allowView(PermissionResourceType.ASSET);
        when(tags.findAll()).thenReturn(List.of(Tag.builder().name("Reserve").build()));

        var page = service.tags("atem", -1, 500, authentication);

        assertTrue(page.items().isEmpty());
        assertEquals(0, page.total());
        assertEquals(0, page.page());
        assertEquals(200, page.size());
        assertFalse(page.hasMore());
        verifyNoInteractions(assets, types, mapper);
    }
}
