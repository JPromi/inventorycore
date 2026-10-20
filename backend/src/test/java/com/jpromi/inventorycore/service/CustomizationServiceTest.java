package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Optional;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.dto.CustomizationDto;
import com.jpromi.inventorycore.entity.Customization;
import com.jpromi.inventorycore.enums.BrandingMode;
import com.jpromi.inventorycore.repository.CustomizationRepository;

class CustomizationServiceTest {
    private final CustomizationRepository repository = mock(CustomizationRepository.class);
    private final CustomizationService service = new CustomizationService(repository);
    private final Customization stored = new Customization();

    @BeforeEach
    void setup() {
        when(repository.findById(1L)).thenReturn(Optional.of(stored));
        when(repository.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    private CustomizationDto request(String color, String url) {
        return new CustomizationDto(" Meine Firma ", color, " Willkommen ", " Anmeldung ", url,
            "https://example.org/privacy", null, null, "javascript:ignored");
    }

    @Test
    void savesValidatedPublicSettingsWithoutTrustingClientLogoUrl() {
        var result = service.save(request("#123abc", "https://example.org/legal"));
        assertEquals("Meine Firma", result.brandName());
        assertEquals("Willkommen", result.loginTitle());
        assertEquals("#123abc", service.get().brandColor());
        assertNull(result.logoUrl());
        var reset = service.save(new CustomizationDto(null, null, null, null, null, null, null, null, null));
        assertNull(reset.brandColor());
        assertNull(reset.imprintUrl());
    }

    @Test
    void rejectsUnsafeLinksAndInvalidColorsWithoutChangingSettings() {
        stored.setBrandName("Original");
        for (String url : new String[] { "javascript:alert(1)", "//example.org", "data:text/html,test", "https://user:pass@example.org", "/relative" }) {
            assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.save(request("#123abc", url))).getStatusCode());
        }
        assertThrows(ResponseStatusException.class, () -> service.save(request("red", null)));
        assertEquals("Original", stored.getBrandName());
        verify(repository, never()).save(any());
    }

    @Test
    void reencodesLogoPreservingTransparencyAndVersionsIt() throws Exception {
        var png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(12, 6, BufferedImage.TYPE_INT_ARGB), "png", png);
        String first = service.logo(png.toByteArray()).logoUrl();
        assertTrue(first.startsWith("/api/customization/logo?v="));
        assertEquals("image/png", service.image().getHeaders().getContentType().toString());
        assertNotEquals(first, service.logo(png.toByteArray()).logoUrl());
        assertNotNull(service.image().getBody());
        service.removeLogo();
        assertNull(service.get().logoUrl());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class, service::image).getStatusCode());
    }

    @Test
    void keepsLogoModesIndependentAndDoesNotFallback() throws Exception {
        var png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(12, 6, BufferedImage.TYPE_INT_ARGB), "png", png);
        String lightUrl = service.logo(png.toByteArray()).logoUrl();
        assertNull(service.get().darkLogoUrl());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
            () -> service.image(BrandingMode.dark)).getStatusCode());

        var dark = service.logo(png.toByteArray(), BrandingMode.dark);
        assertEquals(lightUrl, dark.logoUrl());
        assertTrue(dark.darkLogoUrl().startsWith("/api/customization/logo?mode=dark&v="));
        assertEquals("image/png", service.image(BrandingMode.dark).getHeaders().getContentType().toString());
        assertNotNull(ImageIO.read(new java.io.ByteArrayInputStream(service.image(BrandingMode.dark).getBody())));
        String darkUrl = dark.darkLogoUrl();
        byte[] lightBytes = stored.getLogo();
        assertNotEquals(darkUrl, service.logo(png.toByteArray(), BrandingMode.dark).darkLogoUrl());
        assertArrayEquals(lightBytes, stored.getLogo());
        service.removeLogo(BrandingMode.light);
        assertNull(stored.getLogo());
        assertNull(stored.getLogoContentType());
        assertNull(stored.getLogoVersion());
        assertNotNull(service.image(BrandingMode.dark).getBody());

        service.logo(png.toByteArray());
        lightUrl = service.get().logoUrl();
        service.removeLogo(BrandingMode.dark);
        assertNull(service.get().darkLogoUrl());
        assertNull(stored.getDarkLogo());
        assertNull(stored.getDarkLogoContentType());
        assertNull(stored.getDarkLogoVersion());
        assertEquals(lightUrl, service.get().logoUrl());
    }

    @Test
    void disablingAdvancedThemeRetainsDarkSettingsAndIgnoresSubmittedLogoUrls() throws Exception {
        var png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB), "png", png);
        String darkUrl = service.logo(png.toByteArray(), BrandingMode.dark).darkLogoUrl();
        for (boolean enabled : new boolean[] { true, false, true }) {
            var result = service.save(new CustomizationDto("Brand", "#112233", null, null, null, null, null,
                null, "https://ignored.example/light", "#aAbBcC", "https://ignored.example/dark", enabled));
            assertEquals(enabled, result.advancedThemeEnabled());
            assertEquals("#aAbBcC", result.darkBrandColor());
            assertEquals(darkUrl, result.darkLogoUrl());
            assertNull(result.logoUrl());
            assertNotNull(service.image(BrandingMode.dark).getBody());
        }
    }

    @Test
    void legacyNullableAdvancedThemeDefaultsToFalse() {
        stored.setAdvancedThemeEnabled(null);
        assertFalse(service.get().advancedThemeEnabled());
        assertNull(service.get().darkBrandColor());
        assertNull(service.get().darkLogoUrl());
    }

    @Test
    void invalidDarkColorsAreRejectedBeforeAnyMutationEvenWhenDisabled() {
        stored.setBrandName("Original");
        stored.setDarkBrandColor("#abcdef");
        for (String color : new String[] { "red", "#12345g", "#1234567" }) {
            var request = new CustomizationDto("Changed", "#112233", null, null, null, null, null,
                null, null, color, null, false);
            assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.save(request)).getStatusCode());
        }
        assertEquals("Original", stored.getBrandName());
        assertEquals("#abcdef", stored.getDarkBrandColor());
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsNonImagesAndOversizedFiles() {
        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, assertThrows(ResponseStatusException.class,
            () -> service.logo("<svg onload='alert(1)'/>".getBytes())).getStatusCode());
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, assertThrows(ResponseStatusException.class,
            () -> service.logo(new byte[5 * 1024 * 1024 + 1])).getStatusCode());
        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, assertThrows(ResponseStatusException.class,
            () -> service.logo("<svg/>".getBytes(), BrandingMode.dark)).getStatusCode());
        assertNull(stored.getDarkLogo());
    }
}
