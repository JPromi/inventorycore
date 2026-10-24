package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.InspectionItemUpdateRequest;
import com.jpromi.inventorycore.dto.InspectionTypeRequest;
import com.jpromi.inventorycore.entity.*;
import com.jpromi.inventorycore.enums.*;
import com.jpromi.inventorycore.files.FileCleanupService;
import com.jpromi.inventorycore.repository.*;

/** Server-side permission rules: what the UI hides must also be refused by the backend. */
class PermissionRulesTest {
    private final Area edv = Area.builder().id(1L).name("EDV").build();
    private final Area facility = Area.builder().id(2L).name("Facility").build();

    private final AssetRepository assets = mock(AssetRepository.class);
    private final InspectionRepository inspections = mock(InspectionRepository.class);
    private final InspectionTypeRepository types = mock(InspectionTypeRepository.class);
    private final ScanResolver resolver = mock(ScanResolver.class);
    private final AreaRepository areas = mock(AreaRepository.class);
    private final StoredFileRepository files = mock(StoredFileRepository.class);
    private final InspectionService service = new InspectionService(types, inspections, assets,
        mock(AssetTypeRepository.class), mock(LocationRepository.class), mock(TagRepository.class), areas,
        resolver, mock(InspectionItemRepository.class), mock(AssetInspectionScheduleRepository.class),
        mock(InspectionScheduleService.class), files, mock(AuditService.class), mock(AssetStatusService.class),
        mock(FileCleanupService.class));

    private final User inspector = User.builder().username("inspector").displayName("Inspector").build();

    /** May view and inspect assets in EDV only. */
    private final AccessContext edvInspector = new AccessContext(false, List.of(GroupPermission.builder()
        .resourceType(PermissionResourceType.ASSET).area(edv).canView(true).canInspect(true).build()));

    private Inspection openInspection(Asset... items) {
        Inspection inspection = Inspection.builder().title("Inventur").typeName("Inventur").area(edv)
            .mode(InspectionMode.INVENTORY).createdByUuid(UUID.randomUUID()).createdByName("Someone").items(new ArrayList<>()).build();
        for (Asset asset : items) {
            inspection.getItems().add(InspectionItem.builder().inspection(inspection).asset(asset).assetName(asset.getName()).expected(true).build());
        }
        when(inspections.findByUuid(inspection.getUuid())).thenReturn(Optional.of(inspection));
        when(inspections.save(any())).thenAnswer(call -> call.getArgument(0));
        return inspection;
    }

    @Test
    void scanningAnAssetOfAnotherAreaRecordsNothing() {
        Asset printer = Asset.builder().id(5L).name("Drucker").invId("FAC-1").areas(Set.of(facility)).build();
        Inspection inspection = openInspection();
        // visible (e.g. through a location), but not inspectable for this user
        when(resolver.resolve(edvInspector, "FAC-1")).thenReturn(new ScanResolver.Resolution("FAC-1", "CODE", List.of(printer), List.of()));
        var result = service.scan(edvInspector, inspector, inspection.getUuid(), "FAC-1");
        assertEquals("IGNORED", result.outcome());
        assertTrue(inspection.getItems().isEmpty());
    }

    @Test
    void ambiguousCodesRecordNothingUntilTheUserPicksOneOfTheMatches() {
        Asset laptop = Asset.builder().id(1L).name("Laptop").invId("EDV-1").serialNumber("SN-7").areas(Set.of(edv)).build();
        Asset monitor = Asset.builder().id(2L).name("Monitor").invId("SN-7").areas(Set.of(edv)).build();
        Asset other = Asset.builder().id(3L).name("Drucker").areas(Set.of(edv)).build();
        Inspection inspection = openInspection(laptop);
        when(resolver.resolve(edvInspector, "SN-7")).thenReturn(new ScanResolver.Resolution("SN-7", "CODE", List.of(monitor, laptop), List.of()));

        var ambiguous = service.scan(edvInspector, inspector, inspection.getUuid(), "SN-7");
        assertEquals("AMBIGUOUS", ambiguous.outcome());
        assertEquals(List.of("Laptop", "Monitor"), ambiguous.candidates().stream().map(candidate -> candidate.name()).toList());
        assertEquals(List.of("SERIAL_NUMBER", "INV_ID"), ambiguous.candidates().stream().map(candidate -> candidate.matchedBy()).toList());
        assertEquals(List.of(true, false), ambiguous.candidates().stream().map(candidate -> candidate.inInspection()).toList());
        assertEquals(InspectionItemStatus.PENDING, inspection.getItems().get(0).getStatus());

        // only an asset the code matches can be chosen
        assertEquals("IGNORED", service.scan(edvInspector, inspector, inspection.getUuid(), "SN-7", other.getUuid()).outcome());

        var chosen = service.scan(edvInspector, inspector, inspection.getUuid(), "SN-7", laptop.getUuid());
        assertEquals("CHECKED", chosen.outcome());
        assertEquals(InspectionItemStatus.PRESENT, inspection.getItems().get(0).getStatus());
        assertEquals(1, inspection.getItems().size());
    }

    @Test
    void itemsOfOtherAreasCannotBeCheckedAndAreLeftOutOfTheDetail() {
        Asset laptop = Asset.builder().id(1L).name("Laptop").areas(Set.of(edv)).build();
        Asset printer = Asset.builder().id(2L).name("Drucker").areas(Set.of(facility)).build();
        Inspection inspection = openInspection(laptop, printer);
        InspectionItem foreign = inspection.getItems().get(1);

        var error = assertThrows(ResponseStatusException.class, () -> service.updateItem(edvInspector, inspector, inspection.getUuid(),
            foreign.getUuid(), new InspectionItemUpdateRequest(InspectionItemStatus.PRESENT, null, null, null)));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        assertEquals(InspectionItemStatus.PENDING, foreign.getStatus());

        var detail = service.inspection(edvInspector, inspection.getUuid());
        assertEquals(List.of("Laptop"), detail.items().stream().map(item -> item.assetName()).toList());
    }

    @Test
    void openProtocolsAreDeletedOnlyByTheirCreatorOrWithTheDeleteRight() {
        Inspection inspection = openInspection();
        var error = assertThrows(ResponseStatusException.class, () -> service.delete(edvInspector, inspector, inspection.getUuid()));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(inspections, never()).delete(any());

        inspection.setCreatedByUuid(inspector.getUuid());
        service.delete(edvInspector, inspector, inspection.getUuid());
        verify(inspections).delete(inspection);
    }

    @Test
    void templatesNeedTheRightInEveryChosenArea() {
        AccessContext edvTypeEditor = new AccessContext(false, List.of(GroupPermission.builder()
            .resourceType(PermissionResourceType.ASSET_TYPE).area(edv).canView(true).canEdit(true).canCreate(true).build()));
        when(areas.findByUuid(edv.getUuid())).thenReturn(Optional.of(edv));
        when(areas.findByUuid(facility.getUuid())).thenReturn(Optional.of(facility));
        when(types.save(any())).thenAnswer(call -> call.getArgument(0));
        var request = new InspectionTypeRequest("E-Check", null, null, InspectionMode.CHECK, null, null, false,
            List.of(), List.of(edv.getUuid(), facility.getUuid()), List.of(), List.of(), false, List.of(), List.of(), List.of(), null);
        var error = assertThrows(ResponseStatusException.class, () -> service.createType(edvTypeEditor, request));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(types, never()).save(any());
    }

    @Test
    void filesOfOtherObjectsCannotBeAttachedAndUploadsNeedSomeRight() {
        StoredFile own = StoredFile.builder().id(1L).build();
        StoredFile foreign = StoredFile.builder().id(2L).build();
        when(files.findByUuid(own.getUuid())).thenReturn(Optional.of(own));
        when(files.findByUuid(foreign.getUuid())).thenReturn(Optional.of(foreign));
        when(files.assetsUsing(foreign)).thenReturn(List.of(Asset.builder().name("Other").build()));
        FileAccess access = new FileAccess(files);

        assertSame(own, access.attachable(own.getUuid(), Set.of()));
        assertSame(foreign, access.attachable(foreign.getUuid(), Set.of(foreign.getUuid())), "already part of this object");
        var error = assertThrows(ResponseStatusException.class, () -> access.attachable(foreign.getUuid(), Set.of()));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());

        assertFalse(FileAccess.canUpload(new AccessContext(false, List.of(GroupPermission.builder()
            .resourceType(PermissionResourceType.ASSET).area(edv).canView(true).build()))));
        assertTrue(FileAccess.canUpload(edvInspector));
    }

    @Test
    void filesAreReadableOnlyThroughAVisibleObjectOrForTheUploader() {
        Asset printer = Asset.builder().name("Drucker").areas(Set.of(facility)).build();
        StoredFile photo = StoredFile.builder().id(3L).uploadedByUuid(UUID.randomUUID()).build();
        when(files.assetsUsing(photo)).thenReturn(List.of(printer));
        FileAccess access = new FileAccess(files);
        assertFalse(access.canRead(edvInspector, inspector, photo));
        photo.setUploadedByUuid(inspector.getUuid());
        assertTrue(access.canRead(edvInspector, inspector, photo));
    }
}
