package com.jpromi.inventorycore.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.TagRequest;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.TagRepository;
import com.jpromi.inventorycore.service.*;

class TagPermissionsTest {
    private final Area edv = Area.builder().id(1L).name("EDV").build();
    private final Area atemschutz = Area.builder().id(2L).name("Atemschutz").build();
    private final Tag computer = Tag.builder().id(1L).area(edv).name("Computer").color("#123456").build();
    private final Tag mask = Tag.builder().id(2L).area(atemschutz).name("Maske").build();
    private final TagRepository tags = mock(TagRepository.class);
    private final AreaRepository areas = mock(AreaRepository.class);
    private final PermissionService permissions = mock(PermissionService.class);
    private final Authentication authentication = mock(Authentication.class);
    private final InventoryController controller = new InventoryController(null, null, null, tags, areas, null,
        permissions, new ApiMapper(), mock(AuditService.class), null, null, null, null);

    private void areaAdmin() {
        when(permissions.context(authentication)).thenReturn(new AccessContext(false, List.of(
            GroupPermission.builder().area(edv).admin(true).build())));
    }

    @Test
    void areaAdminCanRecolorOwnTag() {
        areaAdmin();
        when(tags.findByUuid(computer.getUuid())).thenReturn(Optional.of(computer));
        when(tags.save(any())).thenAnswer(call -> call.getArgument(0));
        var result = controller.updateTag(computer.getUuid(), new TagRequest("Computer", "#abcdef", edv.getUuid()), authentication);
        assertEquals("#abcdef", result.color());
        assertEquals(edv.getUuid(), result.areaUuid());
    }

    @Test
    void areaAdminCannotRecolorOrDeleteForeignTagEvenWithItsUuid() {
        areaAdmin();
        when(tags.findByUuid(mask.getUuid())).thenReturn(Optional.of(mask));
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class, () ->
            controller.updateTag(mask.getUuid(), new TagRequest("Maske", "#abcdef", atemschutz.getUuid()), authentication)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class, () ->
            controller.deleteTag(mask.getUuid(), authentication)).getStatusCode());
        verify(tags, never()).save(any());
        verify(tags, never()).delete(any());
    }

    @Test
    void visibleForeignTagStillNeedsEditPermissionInItsOwnArea() {
        when(permissions.context(authentication)).thenReturn(new AccessContext(false, List.of(
            GroupPermission.builder().area(edv).admin(true).build(),
            GroupPermission.builder().area(atemschutz).canView(true).build())));
        when(tags.findByUuid(mask.getUuid())).thenReturn(Optional.of(mask));
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () ->
            controller.updateTag(mask.getUuid(), new TagRequest("Maske", "#abcdef", atemschutz.getUuid()), authentication)).getStatusCode());
    }

    @Test
    void creationRequiresRightsInTheRequestedArea() {
        areaAdmin();
        when(areas.findByUuid(atemschutz.getUuid())).thenReturn(Optional.of(atemschutz));
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () ->
            controller.createTag(new TagRequest("Computer", "#abcdef", atemschutz.getUuid()), authentication)).getStatusCode());
        verify(tags, never()).save(any());
    }

    @Test
    void sameNameInAnotherAreaDoesNotPreventCreation() {
        areaAdmin();
        when(areas.findByUuid(edv.getUuid())).thenReturn(Optional.of(edv));
        when(tags.save(any())).thenAnswer(call -> call.getArgument(0));
        var created = controller.createTag(new TagRequest("Computer", "#abcdef", edv.getUuid()), authentication);
        assertEquals(edv.getUuid(), created.areaUuid());
        verify(tags).existsByAreaAndNameIgnoreCase(edv, "Computer");
    }

    @Test
    void tagCannotBeMovedByChangingTheRequestArea() {
        areaAdmin();
        when(tags.findByUuid(computer.getUuid())).thenReturn(Optional.of(computer));
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class, () ->
            controller.updateTag(computer.getUuid(), new TagRequest("Computer", null, atemschutz.getUuid()), authentication)).getStatusCode());
        assertEquals(edv, computer.getArea());
    }

    @Test
    void listOnlyContainsAccessibleAreaTags() {
        areaAdmin();
        when(tags.findAll()).thenReturn(List.of(mask, computer));
        assertEquals(List.of(computer.getUuid()), controller.tags(authentication).stream().map(tag -> tag.uuid()).toList());
    }

    @Test
    void areaAdminCanDeleteOwnTagButDuplicateNamesInItsAreaAreRejected() {
        areaAdmin();
        when(tags.findByUuid(computer.getUuid())).thenReturn(Optional.of(computer));
        controller.deleteTag(computer.getUuid(), authentication);
        verify(tags).detachFromAssets(computer.getId());
        verify(tags).detachFromAssetTypes(computer.getId());
        verify(tags).delete(computer);
        when(areas.findByUuid(edv.getUuid())).thenReturn(Optional.of(edv));
        when(tags.existsByAreaAndNameIgnoreCase(edv, "Computer")).thenReturn(true);
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class, () ->
            controller.createTag(new TagRequest("Computer", null, edv.getUuid()), authentication)).getStatusCode());
    }

    @Test
    void newForeignReferencesAreRefusedButExistingSharedObjectTagsCanBeRetained() {
        var access = new AccessContext(false, List.of(GroupPermission.builder().area(edv).admin(true).build()));
        assertThrows(ResponseStatusException.class, () -> TagScope.assign(access, mask, Set.of(edv, atemschutz), Set.of()));
        assertEquals(mask, TagScope.assign(access, mask, Set.of(edv, atemschutz), Set.of(mask.getUuid())));
    }

    @Test
    void foreignTagsCannotBeAssignedToAnObjectAndAreNotInheritedAcrossAreas() {
        assertThrows(ResponseStatusException.class, () -> TagScope.inAreas(computer, Set.of(atemschutz)));
        var type = com.jpromi.inventorycore.entity.AssetType.builder().tags(Set.of(computer)).build();
        var asset = com.jpromi.inventorycore.entity.Asset.builder().areas(Set.of(atemschutz)).assetType(type).build();
        assertTrue(TagScope.tagsOf(asset).toList().isEmpty());
        asset.setAreas(Set.of(edv));
        assertEquals(List.of(computer), TagScope.tagsOf(asset).toList());
    }

    @Test
    void deletingAnAreaPreservesTagIdentityAndScopeOnSharedObjectsDespiteNameConflicts() {
        var defaultArea = Area.builder().id(3L).name("Allgemein").defaultArea(true).build();
        var asset = com.jpromi.inventorycore.entity.Asset.builder()
            .areas(new java.util.HashSet<>(Set.of(edv, atemschutz))).tags(Set.of(computer)).build();
        var assets = mock(com.jpromi.inventorycore.repository.AssetRepository.class);
        when(assets.findByArea(edv)).thenReturn(List.of(asset));
        when(areas.findByUuid(edv.getUuid())).thenReturn(Optional.of(edv));
        when(areas.findFirstByDefaultAreaTrue()).thenReturn(Optional.of(defaultArea));
        when(tags.findByArea(edv)).thenReturn(List.of(computer));
        when(tags.existsByAreaAndNameIgnoreCase(defaultArea, "Computer")).thenReturn(true);
        var admin = new AdminController(
            mock(com.jpromi.inventorycore.repository.AppUserRepository.class),
            mock(com.jpromi.inventorycore.repository.GroupRepository.class),
            mock(com.jpromi.inventorycore.repository.GroupPermissionRepository.class), areas, assets,
            mock(com.jpromi.inventorycore.repository.LocationRepository.class),
            mock(com.jpromi.inventorycore.repository.AssetTypeRepository.class),
            mock(com.jpromi.inventorycore.repository.LabelTemplateRepository.class), null, null, mock(AuditService.class),
            mock(com.jpromi.inventorycore.repository.InspectionRepository.class),
            mock(com.jpromi.inventorycore.repository.InspectionTypeRepository.class),
            mock(com.jpromi.inventorycore.repository.AssetStatusRepository.class),
            mock(com.jpromi.inventorycore.repository.TaskRepository.class),
            mock(com.jpromi.inventorycore.repository.TaskRunRepository.class), tags);
        admin.deleteArea(edv.getUuid());
        assertEquals(defaultArea, computer.getArea());
        assertEquals("Computer (EDV, 1)", computer.getName());
        assertEquals(Set.of(defaultArea, atemschutz), asset.getAreas());
        assertEquals(List.of(computer), asset.effectiveTags().toList());
        verify(areas).delete(edv);
    }
}
