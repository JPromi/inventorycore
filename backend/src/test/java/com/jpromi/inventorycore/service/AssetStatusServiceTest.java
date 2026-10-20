package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetStatus;
import com.jpromi.inventorycore.entity.AssetStatusChange;
import com.jpromi.inventorycore.entity.Inspection;
import com.jpromi.inventorycore.entity.InspectionItem;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AssetStatusCategory;
import com.jpromi.inventorycore.enums.AssetStatusKey;
import com.jpromi.inventorycore.enums.InspectionCondition;
import com.jpromi.inventorycore.enums.InspectionItemStatus;
import com.jpromi.inventorycore.repository.AssetStatusChangeRepository;
import com.jpromi.inventorycore.repository.AssetStatusRepository;

class AssetStatusServiceTest {

    private final AssetStatusRepository statuses = mock(AssetStatusRepository.class);
    private final AssetStatusChangeRepository changes = mock(AssetStatusChangeRepository.class);
    private final AssetStatusService service = new AssetStatusService(statuses, changes, new ApiMapper());

    private static long nextId = 1;

    private static AssetStatus builtIn(AssetStatusKey key) {
        return AssetStatus.builder().id(nextId++).systemKey(key).name(key.defaultName()).category(key.category()).build();
    }

    private static AssetStatus custom(String name, AssetStatusCategory category, Area area) {
        return AssetStatus.builder().id(nextId++).name(name).category(category).area(area).build();
    }

    private static InspectionItem item(InspectionItemStatus status, InspectionCondition condition, boolean expected) {
        return InspectionItem.builder().status(status).condition(condition).expected(expected).build();
    }

    private static AssetStatusKey after(InspectionItemStatus status, InspectionCondition condition, AssetStatus current) {
        return AssetStatusService.statusAfter(item(status, condition, true), current);
    }

    @Test
    void defectResultsMakeTheAssetDefectUnlessItAlreadyIs() {
        AssetStatus available = builtIn(AssetStatusKey.AVAILABLE);
        assertEquals(AssetStatusKey.DEFECT, after(InspectionItemStatus.FAILED, null, available));
        assertEquals(AssetStatusKey.DEFECT, after(InspectionItemStatus.PRESENT, InspectionCondition.DEFECT, available));
        // "In Reparatur" is a defect status already: it stays
        assertNull(after(InspectionItemStatus.FAILED, null, builtIn(AssetStatusKey.IN_REPAIR)));
        assertNull(after(InspectionItemStatus.FAILED, null, custom("Beim Hersteller", AssetStatusCategory.DEFECT, null)));
    }

    @Test
    void passedChecksEndDefectsButOnlyFindingAnAssetDoesNot() {
        AssetStatus defect = builtIn(AssetStatusKey.DEFECT);
        assertEquals(AssetStatusKey.AVAILABLE, after(InspectionItemStatus.PASSED, null, defect));
        assertEquals(AssetStatusKey.AVAILABLE, after(InspectionItemStatus.PRESENT, InspectionCondition.OK, defect));
        // found, but nobody checked whether it works
        assertNull(after(InspectionItemStatus.PRESENT, null, defect));
        // found again or delivered
        assertEquals(AssetStatusKey.AVAILABLE, after(InspectionItemStatus.PRESENT, null, builtIn(AssetStatusKey.MISSING)));
        assertEquals(AssetStatusKey.AVAILABLE, after(InspectionItemStatus.PRESENT, null, builtIn(AssetStatusKey.IN_DELIVERY)));
        // a custom active status ("Verliehen") and "Vorhanden" stay
        assertNull(after(InspectionItemStatus.PASSED, null, custom("Verliehen", AssetStatusCategory.ACTIVE, null)));
        assertNull(after(InspectionItemStatus.PASSED, null, builtIn(AssetStatusKey.AVAILABLE)));
    }

    @Test
    void missingAssetsAreMarkedOnlyWhenExpected() {
        AssetStatus available = builtIn(AssetStatusKey.AVAILABLE);
        assertEquals(AssetStatusKey.MISSING, after(InspectionItemStatus.MISSING, null, available));
        assertNull(AssetStatusService.statusAfter(item(InspectionItemStatus.MISSING, null, false), available));
        assertNull(after(InspectionItemStatus.MISSING, null, builtIn(AssetStatusKey.MISSING)));
        assertNull(after(InspectionItemStatus.PENDING, null, available));
    }

    @Test
    void retiredAssetsAreNeverChangedByInspections() {
        AssetStatus retired = builtIn(AssetStatusKey.RETIRED);
        for (InspectionItemStatus status : InspectionItemStatus.values()) {
            assertNull(after(status, InspectionCondition.DEFECT, retired));
            assertNull(after(status, InspectionCondition.OK, retired));
        }
    }

    @Test
    void retiredAssetsAreNoLongerDueForInspections() {
        Asset asset = Asset.builder().name("Atemschutzgerät PA 1").status(builtIn(AssetStatusKey.AVAILABLE)).build();
        assertTrue(asset.isInspectionRequired());
        asset.setStatus(builtIn(AssetStatusKey.RETIRED));
        assertFalse(asset.isInspectionRequired());
    }

    @Test
    void aChangeIsKeptWithCommentAuthorAndProtocol() {
        AssetStatus available = builtIn(AssetStatusKey.AVAILABLE);
        AssetStatus defect = builtIn(AssetStatusKey.DEFECT);
        Asset asset = Asset.builder().name("HLF 20").status(available).build();
        User user = User.builder().username("inv").displayName("Gerätewart").build();
        Inspection inspection = Inspection.builder().title("Jahresprüfung 2026").build();

        assertTrue(service.change(asset, defect, "  Ventil undicht  ", user, inspection));
        assertFalse(service.change(asset, defect, "nochmal", user, null));

        ArgumentCaptor<AssetStatusChange> saved = ArgumentCaptor.forClass(AssetStatusChange.class);
        verify(changes, times(1)).save(saved.capture());
        AssetStatusChange change = saved.getValue();
        assertSame(available, change.getFromStatus());
        assertSame(defect, change.getToStatus());
        assertEquals("Ventil undicht", change.getComment());
        assertEquals("Gerätewart", change.getChangedByName());
        assertEquals("Jahresprüfung 2026", change.getInspectionTitle());
        assertSame(defect, asset.getStatus());
        assertNotNull(asset.getStatusChangedAt());
    }

    @Test
    void completingAnInspectionSetsTheStatusOfEveryAsset() {
        AssetStatus available = builtIn(AssetStatusKey.AVAILABLE);
        AssetStatus defect = builtIn(AssetStatusKey.DEFECT);
        AssetStatus missing = builtIn(AssetStatusKey.MISSING);
        when(statuses.findBySystemKey(AssetStatusKey.AVAILABLE)).thenReturn(Optional.of(available));
        when(statuses.findBySystemKey(AssetStatusKey.DEFECT)).thenReturn(Optional.of(defect));
        when(statuses.findBySystemKey(AssetStatusKey.MISSING)).thenReturn(Optional.of(missing));

        Asset broken = Asset.builder().name("Tragkraftspritze").status(available).build();
        Asset gone = Asset.builder().name("Wärmebildkamera").status(available).build();
        Asset fine = Asset.builder().name("Hydraulisches Rettungsgerät").status(available).build();
        Inspection inspection = Inspection.builder().title("Inventur Gerätehaus").items(new ArrayList<>()).build();
        inspection.getItems().addAll(List.of(
            InspectionItem.builder().asset(broken).status(InspectionItemStatus.PRESENT).condition(InspectionCondition.DEFECT).expected(true).build(),
            InspectionItem.builder().asset(gone).status(InspectionItemStatus.MISSING).expected(true).build(),
            InspectionItem.builder().asset(fine).status(InspectionItemStatus.PRESENT).condition(InspectionCondition.OK).expected(true).build()));

        service.applyInspection(inspection, User.builder().username("inv").build());

        assertSame(defect, broken.getStatus());
        assertSame(missing, gone.getStatus());
        assertSame(available, fine.getStatus());
        verify(changes, times(2)).save(any());
    }

    @Test
    void customStatusesOnlyFitAssetsOfTheirArea() {
        Area atemschutz = Area.builder().id(10L).name("Atemschutz").build();
        Area fahrzeuge = Area.builder().id(11L).name("Fahrzeuge").build();
        AssetStatus lent = custom("Verliehen", AssetStatusCategory.ACTIVE, atemschutz);
        Asset inArea = Asset.builder().name("PA 1").areas(Set.of(atemschutz)).build();
        Asset elsewhere = Asset.builder().name("HLF 20").areas(Set.of(fahrzeuge)).build();

        assertTrue(AssetStatusService.usableFor(lent, inArea));
        assertFalse(AssetStatusService.usableFor(lent, elsewhere));
        assertTrue(AssetStatusService.usableFor(builtIn(AssetStatusKey.RETIRED), elsewhere));

        when(statuses.findByUuid(lent.getUuid())).thenReturn(Optional.of(lent));
        assertThrows(ResponseStatusException.class, () -> service.resolve(lent.getUuid(), elsewhere));
        assertSame(lent, service.resolve(lent.getUuid(), inArea));
    }
}
