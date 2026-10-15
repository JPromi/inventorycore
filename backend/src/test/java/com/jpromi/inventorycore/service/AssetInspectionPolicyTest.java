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
    private final AccessContext admin = new AccessContext(true, List.of());
    private final User user = User.builder().username("admin").displayName("Admin").build();
    private final InspectionService service = new InspectionService(types, inspections, assets,
        mock(AssetTypeRepository.class), mock(LocationRepository.class), mock(TagRepository.class), mock(AreaRepository.class),
        resolver, mock(InspectionItemRepository.class), mock(AssetInspectionScheduleRepository.class),
        mock(InspectionScheduleService.class), mock(StoredFileRepository.class), mock(AuditService.class));

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
        var request = new InspectionCreateRequest(type.getUuid(), "Inventur", null, false, null, false);
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
