package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.dto.AssetFieldValueResponse;
import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.dto.AssetImageResponse;
import com.jpromi.inventorycore.dto.AssetResponse;
import com.jpromi.inventorycore.dto.TagResponse;
import com.jpromi.inventorycore.entity.AuditLog;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.enums.ImageKind;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.AuditLogRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.TagRepository;

class AuditServiceTest {

    private final LocationRepository locationRepository = mock(LocationRepository.class);
    private final AuditService service = new AuditService(
        mock(AuditLogRepository.class), mock(AppUserRepository.class), mock(AssetRepository.class), mock(AssetTypeRepository.class),
        locationRepository, mock(AreaRepository.class), mock(TagRepository.class), mock(GroupRepository.class));

    private final UUID store = UUID.randomUUID();
    private final UUID office = UUID.randomUUID();
    private final TagResponse it = new TagResponse(UUID.randomUUID(), "EDV", null);
    private final TagResponse broken = new TagResponse(UUID.randomUUID(), "Defekt", null);

    @Test
    void describesChangedFieldsInGerman() {
        when(locationRepository.findByUuid(any())).thenReturn(Optional.empty());
        when(locationRepository.findByUuid(store)).thenReturn(Optional.of(Location.builder().name("Lager").build()));
        when(locationRepository.findByUuid(office)).thenReturn(Optional.of(Location.builder().name("Büro").build()));

        AssetResponse before = asset("Laptop", "SN-1", store, Set.of(it), List.of(field("RAM", "8 GB")), 1);
        AssetResponse after = asset("Laptop 14\"", "SN-1", office, Set.of(it, broken), List.of(field("RAM", "16 GB")), 2);

        List<AuditDetail> changes = service.diff(before, after);

        assertTrue(changes.contains(AuditDetail.change("name", "Laptop", "Laptop 14\"")), changes.toString());
        assertTrue(changes.contains(AuditDetail.change("locationUuid", "Lager", "Büro")), "references by name: " + changes);
        assertTrue(changes.contains(AuditDetail.listChange("tags", List.of("Defekt"), List.of())), changes.toString());
        assertTrue(changes.contains(AuditDetail.customField("RAM", "8 GB", "16 GB")), changes.toString());
        assertTrue(changes.contains(AuditDetail.change("images", "1", "2")), changes.toString());
        assertEquals(5, changes.size(), "unchanged serial number is not listed: " + changes);
    }

    @Test
    void detailsAreStoredAsJsonWithoutText() {
        AuditLog log = AuditLog.builder()
            .action(AuditAction.SCAN)
            .objectType(AuditObjectType.ASSET)
            .details("[{\"code\":\"SCAN_PAGE\",\"params\":{\"code\":\"INV-1\"}},{\"field\":\"name\",\"from\":\"a\",\"to\":\"b\"}]")
            .build();
        List<AuditDetail> details = AuditService.toResponse(log).details();
        assertEquals(AuditDetail.event("SCAN_PAGE", "code", "INV-1"), details.get(0));
        assertEquals(AuditDetail.change("name", "a", "b"), details.get(1));
    }

    @Test
    void oldTextEntriesStayReadable() {
        AuditLog log = AuditLog.builder().action(AuditAction.UPDATE).objectType(AuditObjectType.ASSET).details("Name: a → b").build();
        assertEquals(AuditDetail.event("TEXT", "text", "Name: a → b"), AuditService.toResponse(log).details().get(0));
    }
    @Test
    void nothingChangedMeansNoLines() {
        AssetResponse asset = asset("Laptop", "", null, Set.of(it), List.of(), 0);
        AssetResponse same = asset("Laptop", null, null, Set.of(it), List.of(), 0);
        assertTrue(service.diff(asset, same).isEmpty(), "blank and null count as equal");
    }

    private AssetResponse asset(String name, String serial, UUID location, Set<TagResponse> tags, List<AssetFieldValueResponse> fields, int images) {
        List<AssetImageResponse> imageList = java.util.stream.IntStream.range(0, images)
            .mapToObj(index -> new AssetImageResponse(UUID.randomUUID(), ImageKind.GALLERY, null, "/x" + index, null, null, null, index, null))
            .toList();
        return new AssetResponse(UUID.randomUUID(), "INV-1", name, null, serial, null, null, null, location, tags, fields, imageList,
            null, null, false, Set.of(), null, null, com.jpromi.inventorycore.enums.AssetInspectionPolicy.STANDARD);
    }

    private static AssetFieldValueResponse field(String name, String value) {
        return new AssetFieldValueResponse(UUID.randomUUID(), null, "ram", name, value, true);
    }
}
