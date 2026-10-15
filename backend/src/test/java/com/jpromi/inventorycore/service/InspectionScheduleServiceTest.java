package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.dto.InspectionDueResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetInspectionSchedule;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.InspectionType;
import com.jpromi.inventorycore.enums.InspectionCondition;
import com.jpromi.inventorycore.enums.InspectionItemStatus;
import com.jpromi.inventorycore.enums.IntervalUnit;
import com.jpromi.inventorycore.repository.AssetInspectionScheduleRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.InspectionItemRepository;
import com.jpromi.inventorycore.repository.InspectionTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

class InspectionScheduleServiceTest {

    private final InspectionTypeRepository typeRepository = mock(InspectionTypeRepository.class);
    private final AssetRepository assetRepository = mock(AssetRepository.class);
    private final InspectionItemRepository itemRepository = mock(InspectionItemRepository.class);
    private final AssetInspectionScheduleRepository scheduleRepository = mock(AssetInspectionScheduleRepository.class);
    private final LocationRepository locationRepository = mock(LocationRepository.class);
    private final InspectionScheduleService service =
        new InspectionScheduleService(typeRepository, assetRepository, itemRepository, scheduleRepository, locationRepository);
    private final AccessContext admin = new AccessContext(true, List.of());

    private final AssetType vehicle = AssetType.builder().id(10L).name("Fahrzeug").build();
    private final AssetType laptop = AssetType.builder().id(11L).name("Laptop").build();
    private final InspectionType brakes = InspectionType.builder().id(20L).name("Bremsen").intervalValue(6).intervalUnit(IntervalUnit.WEEKS).build();
    private final Asset car = Asset.builder().id(1L).name("Auto").assetType(vehicle).build();

    private final List<Object[]> checks = new ArrayList<>();
    private final List<AssetInspectionSchedule> overrides = new ArrayList<>();

    @BeforeEach
    void setUp() {
        brakes.getAssetTypes().add(vehicle);
        when(typeRepository.findAll()).thenReturn(List.of(brakes));
        when(assetRepository.findByDeletedFalse()).thenReturn(List.of(car, Asset.builder().id(2L).name("Notebook").assetType(laptop).build()));
        when(itemRepository.findChecks()).thenReturn(checks);
        when(scheduleRepository.findAll()).thenReturn(overrides);
        when(locationRepository.findAll()).thenReturn(List.of());
    }

    @Test
    void recurringTagsMatchDirectAndInheritedTagsButNotDefaultTags() {
        var tag = com.jpromi.inventorycore.entity.Tag.builder().name("Safety").build();
        brakes.getRecurringTags().add(tag);
        brakes.getDefaultTags().add(tag);
        assertTrue(service.all(admin).isEmpty());
        car.getTags().add(tag);
        assertEquals(1, service.all(admin).size());
        car.getTags().clear();
        vehicle.getTags().add(tag);
        assertEquals(1, service.all(admin).size());
        vehicle.getTags().clear();
        brakes.getRecurringTags().clear();
        assertEquals(1, service.all(admin).size());
    }

    @Test
    void excludedAssetsHaveNoDueDatesWhileManualAssetsRemainScheduled() {
        car.setInspectionPolicy(com.jpromi.inventorycore.enums.AssetInspectionPolicy.EXCLUDED);
        assertTrue(service.all(admin).isEmpty());
        car.setInspectionPolicy(com.jpromi.inventorycore.enums.AssetInspectionPolicy.MANUAL);
        assertEquals(1, service.all(admin).size());
    }

    @Test
    void neverCheckedIsDueTodayAndOnlyForAssignedTypes() {
        List<InspectionDueResponse> due = service.all(admin);
        assertEquals(1, due.size(), "the laptop does not need the brake inspection");
        assertEquals("DUE", due.get(0).state());
        assertEquals(LocalDate.now(), due.get(0).nextDueDate());
        assertNull(due.get(0).lastCheckedAt());
    }

    @Test
    void passedCheckResetsTheInterval() {
        check(InspectionItemStatus.PASSED, 10);
        InspectionDueResponse entry = service.all(admin).get(0);
        assertEquals("OK", entry.state());
        assertEquals(LocalDate.now().minusDays(10).plusWeeks(6), entry.nextDueDate());
    }

    @Test
    void intervalPassedMeansOverdue() {
        check(InspectionItemStatus.PRESENT, 50);
        InspectionDueResponse entry = service.all(admin).get(0);
        assertEquals("OVERDUE", entry.state());
        assertEquals(-8, entry.daysUntilDue());
    }

    @Test
    void defectAfterLastPassIsDueAtOnce() {
        check(InspectionItemStatus.PASSED, 20);
        check(InspectionItemStatus.FAILED, 3);
        InspectionDueResponse entry = service.all(admin).get(0);
        assertEquals("OVERDUE", entry.state());
        assertEquals(InspectionItemStatus.FAILED, entry.lastResult());
    }

    @Test
    void defectFoundInInventoryIsDueAgainAtOnce() {
        check(InspectionItemStatus.PASSED, 20);
        checks.add(new Object[] { car.getId(), brakes.getId(), InspectionItemStatus.PRESENT, OffsetDateTime.now().minusDays(2), "Tester",
            InspectionCondition.DEFECT });
        InspectionDueResponse entry = service.all(admin).get(0);
        assertEquals("OVERDUE", entry.state());
        assertEquals(InspectionItemStatus.FAILED, entry.lastResult());

        // present and working resets the interval as usual
        checks.add(new Object[] { car.getId(), brakes.getId(), InspectionItemStatus.PRESENT, OffsetDateTime.now(), "Tester",
            InspectionCondition.OK });
        assertEquals("OK", service.all(admin).get(0).state());
    }

    @Test
    void fixedDateWinsUntilTheNextCheck() {
        check(InspectionItemStatus.PASSED, 10);
        LocalDate fixed = LocalDate.now().plusDays(3);
        overrides.add(AssetInspectionSchedule.builder().asset(car).inspectionType(brakes).fixedDueDate(fixed).setAt(OffsetDateTime.now().minusDays(1)).build());
        InspectionDueResponse entry = service.all(admin).get(0);
        assertEquals(fixed, entry.nextDueDate());
        assertEquals("DUE", entry.state());

        // checked after the date was set: the interval counts again
        check(InspectionItemStatus.PASSED, 0);
        entry = service.all(admin).get(0);
        assertNull(entry.fixedDueDate());
        assertEquals(LocalDate.now().plusWeeks(6), entry.nextDueDate());
    }

    @Test
    void dueAssetsForStartingOnlyDueInspections() {
        check(InspectionItemStatus.PASSED, 40);
        assertTrue(service.dueAssetUuids(List.of(car), brakes, 7).contains(car.getUuid()), "due in 2 days");
        assertTrue(service.dueAssetUuids(List.of(car), brakes, 0).isEmpty(), "not yet overdue");
    }

    @Test
    void typeWithAreasOnlyAppliesToAssetsInThem() {
        Area it = Area.builder().id(30L).name("EDV").build();
        Area workshop = Area.builder().id(31L).name("Werkstatt").build();
        brakes.getAreas().add(it);

        car.getAreas().add(workshop);
        assertTrue(service.all(admin).isEmpty(), "the car is not in the area of the inspection");

        car.getAreas().add(it);
        assertEquals(1, service.all(admin).size());
    }

    @Test
    void dueListOnlyShowsTypesTheUserMayInspect() {
        Area it = Area.builder().id(30L).name("EDV").build();
        Area workshop = Area.builder().id(31L).name("Werkstatt").build();
        brakes.getAreas().add(it);
        car.getAreas().add(it);
        car.getAreas().add(workshop);

        // may see and inspect everything in the workshop, but nothing in EDV
        AccessContext workshopInspector = new AccessContext(false, List.of(
            GroupPermission.builder().area(workshop).canView(true).canInspect(true).build()));
        assertTrue(service.all(workshopInspector).isEmpty());
        assertTrue(!InspectionService.canUse(workshopInspector, brakes));

        AccessContext itInspector = new AccessContext(false, List.of(
            GroupPermission.builder().area(it).canView(true).canInspect(true).build()));
        assertEquals(1, service.all(itInspector).size());
        assertTrue(InspectionService.canUse(itInspector, brakes));
    }

    @Test
    void typeForAllAreasNeedsARightForAllAreas() {
        Area it = Area.builder().id(30L).name("EDV").build();
        car.getAreas().add(it);

        AccessContext itInspector = new AccessContext(false, List.of(
            GroupPermission.builder().area(it).canView(true).canInspect(true).build()));
        assertTrue(!InspectionService.canUse(itInspector, brakes), "brakes has no areas, so it is for all areas");
        assertTrue(service.all(itInspector).isEmpty());

        AccessContext inspectorEverywhere = new AccessContext(false, List.of(
            GroupPermission.builder().canView(true).canInspect(true).build()));
        assertTrue(InspectionService.canUse(inspectorEverywhere, brakes));
        assertEquals(1, service.all(inspectorEverywhere).size());
    }

    private void check(InspectionItemStatus status, int daysAgo) {
        checks.add(new Object[] { car.getId(), brakes.getId(), status, OffsetDateTime.now().minusDays(daysAgo), "Tester" });
    }
}
