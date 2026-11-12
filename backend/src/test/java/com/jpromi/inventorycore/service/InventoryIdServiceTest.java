package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.repository.InventoryIdSettingsRepository;

class InventoryIdServiceTest {
    private final InventoryIdSettingsRepository settings = mock(InventoryIdSettingsRepository.class);
    private final InventoryIdService service = new InventoryIdService(settings, mock(org.springframework.jdbc.core.JdbcTemplate.class));
    @Test void defaultHasTenCharactersWithoutYear() {
        when(settings.findById(1L)).thenReturn(Optional.empty());
        assertTrue(service.generate(value -> false).matches("INV-[A-Z0-9]{10}"));
    }
    @Test void rendersAllTokensAndOptionalPrefix() {
        assertEquals("2026-26-20261110-11-10", service.render("{year}-{year_short}-{date}-{month}-{day}", LocalDate.of(2026,11,10)));
        assertTrue(service.generate("{random_number:20}", value -> false).matches("[0-9]{20}"));
        assertTrue(service.generate("{random_letters:12}", value -> false).matches("[A-Z]{12}"));
        assertTrue(service.generate("FW-{random_alphanumeric}", value -> false).matches("FW-[A-Z0-9]{10}"));
    }
    @Test void rejectsInvalidPatternsAndExhaustion() {
        for (String pattern : new String[] {"", "fixed", "{year}", "{random_number:0}", "{random_number:101}", "{random_number:-1}", "{unknown}{random_number}", "{random_number", "x".repeat(250)+"{random_number}"}) {
            assertThrows(ResponseStatusException.class, () -> service.validate(pattern), pattern);
        }
        assertThrows(ResponseStatusException.class, () -> service.validate(null));
        assertThrows(ResponseStatusException.class, () -> service.generate("{random_number:1}", value -> true));
    }
    @Test void retriesOccupiedValues() {
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        service.generate("{random_number}", value -> calls.incrementAndGet() < 4);
        assertEquals(4, calls.get());
    }
}
