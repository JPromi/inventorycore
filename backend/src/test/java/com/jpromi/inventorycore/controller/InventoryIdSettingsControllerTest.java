package com.jpromi.inventorycore.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.repository.*;
import com.jpromi.inventorycore.service.*;

class InventoryIdSettingsControllerTest {
    private final InventoryIdSettingsRepository settings = mock(InventoryIdSettingsRepository.class);
    private final AssetRepository assets = mock(AssetRepository.class);
    private final InventoryIdService generator = new InventoryIdService(settings, mock(org.springframework.jdbc.core.JdbcTemplate.class));
    private final InventoryIdSettingsController controller = new InventoryIdSettingsController(settings, assets, generator, mock(AuditService.class));
    private final String pattern = "INV-{random_alphanumeric:10}";
    @Test void requiresConfirmationAndCurrentSavedPattern() {
        when(settings.findById(1L)).thenReturn(Optional.empty());
        assertThrows(ResponseStatusException.class, () -> controller.regenerate(new InventoryIdSettingsController.RegenerateRequest(pattern, false)));
        assertThrows(ResponseStatusException.class, () -> controller.regenerate(new InventoryIdSettingsController.RegenerateRequest("changed", true)));
        verifyNoInteractions(assets);
    }
    @Test void replacesOnlyNonDeletedAssetsAndPreservesManualNumbers() {
        when(settings.findById(1L)).thenReturn(Optional.empty());
        Asset active = Asset.builder().id(1L).name("A").invId("OLD-1").inventoryNumber("123").build();
        Asset deleted = Asset.builder().id(2L).name("B").invId("OLD-2").deleted(true).build();
        when(assets.findAll()).thenReturn(List.of(active, deleted));
        assertEquals(1, controller.regenerate(new InventoryIdSettingsController.RegenerateRequest(pattern, true)).count());
        assertTrue(active.getInvId().matches("INV-[A-Z0-9]{10}"));
        assertEquals("123", active.getInventoryNumber());
        assertEquals("OLD-2", deleted.getInvId());
        verify(assets).flush();
    }
    @Test void exhaustedSpaceDoesNotPartiallyReplaceIds() {
        var value = new com.jpromi.inventorycore.entity.InventoryIdSettings(); value.setPattern("{random_number:1}");
        when(settings.findById(1L)).thenReturn(Optional.of(value));
        var all = new ArrayList<Asset>();
        for (int i = 0; i < 10; i++) all.add(Asset.builder().id((long)i).name("A").invId(""+i).build());
        when(assets.findAll()).thenReturn(all);
        assertThrows(ResponseStatusException.class, () -> controller.regenerate(new InventoryIdSettingsController.RegenerateRequest(value.getPattern(), true)));
        for (int i=0; i<10; i++) assertEquals(""+i, all.get(i).getInvId());
        verify(assets, never()).flush();
    }
}
