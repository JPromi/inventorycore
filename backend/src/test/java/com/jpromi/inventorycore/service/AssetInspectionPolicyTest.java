package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.dto.InspectionCreateRequest;
import com.jpromi.inventorycore.dto.InspectionItemUpdateRequest;
import com.jpromi.inventorycore.entity.*;
import com.jpromi.inventorycore.enums.*;
import com.jpromi.inventorycore.repository.*;

class AssetInspectionPolicyTest {
    private final AssetRepository assets = mock(AssetRepository.class);
    private final InspectionRepository inspections = mock(InspectionRepository.class);
    private final InspectionTypeRepository types = mock(InspectionTypeRepository.class);
    private final ScanResolver resolver = mock(ScanResolver.class);
    private final LocationRepository locations = mock(LocationRepository.class);
    private final AreaRepository areas = mock(AreaRepository.class);
    private final Area protocolArea = Area.builder().id(1L).name("EDV").build();
    private final InspectionItemRepository items = mock(InspectionItemRepository.class);

    @org.junit.jupiter.api.BeforeEach
    void defaultArea() {
        when(areas.findFirstByDefaultAreaTrue()).thenReturn(Optional.of(protocolArea));
    }
    private final AccessContext admin = new AccessContext(true, List.of());
    private final User user = User.builder().username("admin").displayName("Admin").build();
    private final InspectionService service = new InspectionService(types, inspections, assets,
        mock(AssetTypeRepository.class), locations, mock(TagRepository.class), areas,
        resolver, items, mock(AssetInspectionScheduleRepository.class),
        mock(InspectionScheduleService.class), mock(StoredFileRepository.class), mock(AuditService.class), mock(AssetStatusService.class));

    @Test
    void excludesOptedOutAssetsButKeepsManualChildrenAsIndividuallyCountedSnapshots() {
        var parent = Asset.builder().id(1L).name("Computer").invId("PC").build();
        var manual = Asset.builder().id(2L).name("RAM").invId("RAM").parentAsset(parent).parentAssetNote("Slot 1")
            .inspectionPolicy(AssetInspectionPolicy.MANUAL).build();
        var excluded = Asset.builder().id(3L).name("Cover").inspectionPolicy(AssetInspectionPolicy.EXCLUDED).build();
        var type = InspectionType.builder().name("Inventur").mode(InspectionMode.INVENTORY).build();
        when(types.findByUuid(type.getUuid())).thenReturn(Optional.of(type));
        when(assets.findByDeletedFalse()).thenReturn(List.of(parent, manual, excluded));
        when(inspections.save(any())).thenAnswer(call -> call.getArgument(0));
        var request = new InspectionCreateRequest(type.getUuid(), "Inventur", null, false, null, false, null);
        assertEquals(2, service.preview(admin, request));
        var detail = service.create(admin, user, request);
        assertEquals(2, detail.summary().counts().expected());
        var ram = detail.items().stream().filter(item -> manual.getUuid().equals(item.assetUuid())).findFirst().orElseThrow();
        assertEquals(parent.getUuid(), ram.parentAssetUuid());
        assertEquals("Slot 1", ram.parentAssetNote());
        assertEquals(AssetInspectionPolicy.MANUAL, ram.inspectionPolicy());

        var captured = org.mockito.ArgumentCaptor.forClass(Inspection.class);
        verify(inspections).save(captured.capture());
        var inspection = captured.getValue();
        when(inspections.findByUuid(inspection.getUuid())).thenReturn(Optional.of(inspection));
        when(resolver.resolve(admin, "PC")).thenReturn(new ScanResolver.Resolution("PC", "CODE", List.of(parent), List.of()));
        service.scan(admin, user, inspection.getUuid(), "PC");
        assertEquals(InspectionItemStatus.PENDING, inspection.getItems().stream().filter(item -> item.getAsset() == manual).findFirst().orElseThrow().getStatus());
        when(resolver.resolve(admin, "RAM")).thenReturn(new ScanResolver.Resolution("RAM", "CODE", List.of(manual), List.of()));
        assertEquals("IGNORED", service.scan(admin, user, inspection.getUuid(), "RAM").outcome());
        manual.setInspectionPolicy(AssetInspectionPolicy.EXCLUDED);
        manual.setParentAssetNote("Changed later");
        var updated = service.updateItem(admin, user, inspection.getUuid(), ram.uuid(),
            new InspectionItemUpdateRequest(InspectionItemStatus.PRESENT, null, null, null));
        assertEquals("Slot 1", updated.parentAssetNote());
        assertEquals(AssetInspectionPolicy.MANUAL, updated.inspectionPolicy());
        assertEquals(InspectionCheckMethod.MANUAL, updated.method());
        var completed = service.complete(admin, user, inspection.getUuid(), null);
        assertEquals(2, completed.summary().counts().present());
        assertEquals(0, completed.summary().counts().pending());
    }

    @Test
    void templateProtocolAreaOverridesRequestAndExistingRunKeepsItsArea() {
        var area = Area.builder().id(2L).name("Facility").build();
        var type = InspectionType.builder().name("Inventur").protocolArea(area).build();
        when(types.findByUuid(type.getUuid())).thenReturn(Optional.of(type));
        when(inspections.save(any())).thenAnswer(call -> call.getArgument(0));
        var request = new InspectionCreateRequest(type.getUuid(), null, null, false, null, false, false, protocolArea.getUuid());
        var result = service.create(admin, user, request);
        assertEquals(List.of(area.getUuid()), result.summary().areaUuids());
        var captured = org.mockito.ArgumentCaptor.forClass(Inspection.class);
        verify(inspections).save(captured.capture());
        var inspection = captured.getValue();
        type.setProtocolArea(protocolArea);
        when(inspections.findByUuid(inspection.getUuid())).thenReturn(Optional.of(inspection));
        assertEquals(List.of(area.getUuid()), service.inspection(admin, inspection.getUuid()).summary().areaUuids());
    }

    @Test
    void protocolAreaIsIndependentAndRestrictsListAndDetailAccess() {
        var area = Area.builder().id(2L).name("Facility").build();
        var type = InspectionType.builder().name("Inventur").build();
        when(types.findByUuid(type.getUuid())).thenReturn(Optional.of(type));
        when(areas.findByUuid(area.getUuid())).thenReturn(Optional.of(area));
        when(inspections.save(any())).thenAnswer(call -> call.getArgument(0));
        var request = new InspectionCreateRequest(type.getUuid(), null, null, false, null, false, false, area.getUuid());
        var detail = service.create(admin, user, request);
        assertEquals(List.of(area.getUuid()), detail.summary().areaUuids());
        assertEquals(List.of("Facility"), detail.summary().areaNames());
        var captured = org.mockito.ArgumentCaptor.forClass(Inspection.class);
        verify(inspections).save(captured.capture());
        var inspection = captured.getValue();
        when(inspections.findByUuid(inspection.getUuid())).thenReturn(Optional.of(inspection));
        when(inspections.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(inspection));
        var denied = spy(new AccessContext(true, List.of()));
        doReturn(false).when(denied).can(PermissionResourceType.ASSET, PermissionAction.INSPECT, java.util.Set.of(area));
        assertTrue(service.inspections(denied).isEmpty());
        var asset = Asset.builder().id(10L).name("Computer").build();
        when(assets.findByUuid(asset.getUuid())).thenReturn(Optional.of(asset));
        when(items.findByAsset(asset)).thenReturn(List.of(InspectionItem.builder().asset(asset).inspection(inspection).build()));
        assertTrue(service.inspectionsOfAsset(denied, asset.getUuid()).isEmpty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
            () -> service.inspection(denied, inspection.getUuid())).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> service.create(denied, user, request)).getStatusCode());
    }

    @Test
    void defaultsSelectMultipleLocationsAndTypesAndSnapshotTheirFilters() {
        var one = Location.builder().id(1L).name("Garage").build();
        var two = Location.builder().id(2L).name("Office").build();
        var assetType = AssetType.builder().id(1L).name("PC").build();
        var type = InspectionType.builder().name("Inventur").build();
        type.getDefaultLocations().addAll(List.of(one, two));
        type.getDefaultAssetTypes().add(assetType);
        var first = Asset.builder().id(1L).name("A").location(one).assetType(assetType).build();
        var second = Asset.builder().id(2L).name("B").location(two).assetType(assetType).build();
        var wrongType = Asset.builder().id(3L).name("C").location(one).build();
        var noLocation = Asset.builder().id(4L).name("D").assetType(assetType).build();
        when(types.findByUuid(type.getUuid())).thenReturn(Optional.of(type));
        when(locations.findByUuid(one.getUuid())).thenReturn(Optional.of(one));
        when(locations.findByUuid(two.getUuid())).thenReturn(Optional.of(two));
        when(locations.findByDeletedFalse()).thenReturn(List.of(one, two));
        when(assets.findByDeletedFalse()).thenReturn(List.of(first, second, wrongType, noLocation));
        when(inspections.save(any())).thenAnswer(call -> call.getArgument(0));
        var request = new InspectionCreateRequest(type.getUuid(), null, null, false, null, false, false);
        assertEquals(2, service.preview(admin, request));
        var detail = service.create(admin, user, request);
        assertEquals(2, detail.filter().locationUuids().size());
        assertEquals(List.of(assetType.getUuid()), detail.filter().assetTypeUuids());
        assertEquals(2, detail.items().size());
    }

    @Test
    void templateTagsAndChildFlagAreDefaultsWithIndependentOverrides() {
        var tag = Tag.builder().name("Computer").build();
        var assetType = AssetType.builder().id(1L).name("PC").build();
        assetType.getTags().add(tag);
        var parent = Asset.builder().id(1L).name("PC").assetType(assetType).build();
        var child = Asset.builder().id(2L).name("RAM").parentAsset(parent).build();
        var nested = Asset.builder().id(3L).name("Chip").parentAsset(child).build();
        var excluded = Asset.builder().id(4L).name("Cover").parentAsset(parent)
            .inspectionPolicy(AssetInspectionPolicy.EXCLUDED).build();
        var unrelated = Asset.builder().id(5L).name("Other").build();
        var type = InspectionType.builder().name("Inventur").includeChildAssets(true).build();
        type.getDefaultTags().add(tag);
        when(types.findByUuid(type.getUuid())).thenReturn(Optional.of(type));
        when(assets.findByDeletedFalse()).thenReturn(List.of(parent, child, nested, excluded, unrelated));
        when(inspections.save(any())).thenAnswer(call -> call.getArgument(0));
        var defaults = new InspectionCreateRequest(type.getUuid(), "Inventur", null, false, null, false, null);
        assertEquals(3, service.preview(admin, defaults));
        var restricted = spy(new AccessContext(true, List.of()));
        doReturn(false).when(restricted).canViewAsset(child);
        assertEquals(2, service.preview(restricted, defaults));
        assertEquals(3, service.create(admin, user, defaults).summary().counts().expected());
        assertEquals(1, service.preview(admin,
            new InspectionCreateRequest(type.getUuid(), null, null, false, null, false, false)));
        var emptyFilter = new com.jpromi.inventorycore.dto.InspectionFilter(null, true, List.of(), List.of(), List.of());
        assertEquals(3, service.preview(admin,
            new InspectionCreateRequest(type.getUuid(), null, emptyFilter, false, null, false, true)));
        type.setIncludeChildAssets(false);
        assertEquals(1, service.preview(admin, defaults));
        assertEquals(3, service.preview(admin,
            new InspectionCreateRequest(type.getUuid(), null, null, false, null, false, true)));
    }

    @Test
    void excludedAssetsCannotBeScannedOrExplicitlyAdded() {
        var excluded = Asset.builder().id(3L).name("Cover").inspectionPolicy(AssetInspectionPolicy.EXCLUDED).build();
        var inspection = Inspection.builder().mode(InspectionMode.CHECK).build();
        when(inspections.findByUuid(inspection.getUuid())).thenReturn(Optional.of(inspection));
        when(assets.findByUuid(excluded.getUuid())).thenReturn(Optional.of(excluded));
        when(resolver.resolve(admin, "Cover")).thenReturn(new ScanResolver.Resolution("Cover", "CODE", List.of(excluded), List.of()));
        assertEquals("IGNORED", service.scan(admin, user, inspection.getUuid(), "Cover").outcome());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
            () -> service.addItem(admin, inspection.getUuid(), excluded.getUuid())).getStatusCode());
        assertTrue(inspection.getItems().isEmpty());
    }
}
