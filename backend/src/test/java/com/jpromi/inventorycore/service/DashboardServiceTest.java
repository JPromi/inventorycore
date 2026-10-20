package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.dto.InspectionCounts;
import com.jpromi.inventorycore.dto.InspectionDueResponse;
import com.jpromi.inventorycore.dto.InspectionSummaryResponse;
import com.jpromi.inventorycore.entity.*;
import com.jpromi.inventorycore.enums.*;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

/** The dashboard counts only what the user may see, within the sidebar area selection. */
class DashboardServiceTest {
    private final Area atemschutz = Area.builder().id(1L).name("Atemschutz").build();
    private final Area fahrzeuge = Area.builder().id(2L).name("Fahrzeuge").build();

    private final AssetRepository assets = mock(AssetRepository.class);
    private final LocationRepository locations = mock(LocationRepository.class);
    private final AssetTypeRepository types = mock(AssetTypeRepository.class);
    private final InspectionService inspections = mock(InspectionService.class);
    private final InspectionScheduleService schedules = mock(InspectionScheduleService.class);
    private final DashboardService service = new DashboardService(assets, locations, types, inspections, schedules);

    private final Tag atemschutzTag = Tag.builder().id(1L).name("Atemschutz").color("#c00").build();
    private final Tag pruefpflichtig = Tag.builder().id(2L).name("Prüfpflichtig").color("#06c").build();
    private final AssetType pressluftatmer = AssetType.builder().id(1L).name("Pressluftatmer")
        .areas(Set.of(atemschutz)).tags(Set.of(pruefpflichtig)).build();
    private final Location wache = Location.builder().id(1L).name("Gerätehaus").areas(Set.of(atemschutz)).build();

    /** PA 1 has its own areas, PA 2 belongs to the selection only through its location, the trailer to another area. */
    private final Asset pa1 = Asset.builder().id(1L).name("PA 1").areas(Set.of(atemschutz)).assetType(pressluftatmer)
        .tags(Set.of(atemschutzTag, pruefpflichtig)).build();
    private final Asset pa2 = Asset.builder().id(2L).name("PA 2").areas(Set.of(fahrzeuge)).location(wache)
        .assetType(pressluftatmer).build();
    private final Asset anhaenger = Asset.builder().id(3L).name("Anhänger").areas(Set.of(fahrzeuge)).build();

    private DashboardServiceTest() {
        when(assets.findByDeletedFalse()).thenReturn(List.of(pa1, pa2, anhaenger));
        when(locations.findByDeletedFalse()).thenReturn(List.of(wache));
        when(types.findByDeletedFalse()).thenReturn(List.of(pressluftatmer));
    }

    private static AccessContext access(boolean inspect, Area... areas) {
        return new AccessContext(false, Stream.of(areas).map(area -> GroupPermission.builder()
            .resourceType(null).area(area).canView(true).canInspect(inspect).build()).toList());
    }

    private static InspectionDueResponse due(Asset asset, String state, long days) {
        return new InspectionDueResponse(asset.getUuid(), asset.getName(), null, null, null, UUID.randomUUID(), "Jahresprüfung",
            null, 1, IntervalUnit.YEARS, null, null, null, LocalDate.now().plusDays(days), null, state, days, List.of());
    }

    private static InspectionSummaryResponse completed(Area area, int daysAgo, InspectionCounts counts) {
        return new InspectionSummaryResponse(UUID.randomUUID(), "Inventur " + daysAgo, null, "Inventur", List.of(area.getUuid()),
            List.of(area.getName()), InspectionStatus.COMPLETED, InspectionMode.INVENTORY, true, null,
            OffsetDateTime.now().minusDays(daysAgo + 1), null, "Admin", OffsetDateTime.now().minusDays(daysAgo), "Admin", counts);
    }

    @Test
    void countsAssetsOfTheSelectionAlsoThroughTheirLocation() {
        var result = service.dashboard(access(false, atemschutz, fahrzeuge), List.of(atemschutz.getUuid()));
        assertEquals(2, result.assetCount(), "PA 1 by its area, PA 2 by its location");
        assertEquals(1, result.locationCount());
        assertEquals(1, result.assetTypeCount());
        // the type tag of PA 1 counts once, although it is also assigned directly
        assertEquals(List.of("Prüfpflichtig", "Atemschutz"), result.topTags().stream().map(entry -> entry.name()).toList());
        assertEquals(List.of(2L, 1L), result.topTags().stream().map(entry -> entry.count()).toList());
        assertEquals(2, result.tagCount());

        var all = service.dashboard(access(false, atemschutz, fahrzeuge), List.of());
        assertEquals(3, all.assetCount());
        assertEquals(java.util.Arrays.asList("Pressluftatmer", null), all.assetsByType().stream().map(entry -> entry.name()).toList(),
            "the trailer has no type");
    }

    @Test
    void hidesInvisibleAssetsAndInspectionsWithoutTheInspectRight() {
        var result = service.dashboard(access(false, fahrzeuge), List.of());
        assertEquals(2, result.assetCount(), "PA 1 is only in Atemschutz");
        assertFalse(result.canInspect());
        assertTrue(result.nextDue().isEmpty());
        verifyNoInteractions(inspections, schedules);
    }

    @Test
    void dueDatesAndInspectionsFollowTheSelection() {
        AccessContext inspector = access(true, atemschutz, fahrzeuge);
        when(schedules.all(inspector)).thenReturn(List.of(due(anhaenger, "OVERDUE", -3), due(pa2, "DUE", 5), due(pa1, "OVERDUE", -10)));
        InspectionCounts counts = new InspectionCounts(4, 3, 1, 0, 0, 0, 0, 1, 0);
        when(inspections.inspections(inspector)).thenReturn(List.of(
            completed(atemschutz, 2, counts), completed(fahrzeuge, 1, counts), completed(atemschutz, 120, counts)));

        var result = service.dashboard(inspector, List.of(atemschutz.getUuid()));
        assertEquals(List.of("PA 1", "PA 2"), result.nextDue().stream().map(InspectionDueResponse::assetName).toList(),
            "most urgent first, without the trailer of the other area");
        assertEquals(1, result.due().overdue());
        assertEquals(1, result.due().dueSoon());
        assertEquals(2, result.recentInspections().size());
        assertEquals(1, result.completedInspectionCount(), "only the last 30 days");
        // only the inspection of the last 90 days: 3 present (1 defect), 1 missing
        assertEquals(2, result.results().ok());
        assertEquals(1, result.results().defect());
        assertEquals(1, result.results().missing());
        verify(schedules).all(any());
    }
}
