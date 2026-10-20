package com.jpromi.inventorycore.service;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.dto.CustomizationDto;
import com.jpromi.inventorycore.entity.Customization;
import com.jpromi.inventorycore.enums.BrandingMode;
import com.jpromi.inventorycore.files.ImageProcessor;
import com.jpromi.inventorycore.repository.CustomizationRepository;

@Service
@Transactional
public class CustomizationService {
    private final CustomizationRepository repository;

    public CustomizationService(CustomizationRepository repository) {
        this.repository = repository;
    }

    private Customization settings() {
        return repository.findById(1L).orElseGet(Customization::new);
    }

    @Transactional(readOnly = true)
    public CustomizationDto get() {
        return response(settings());
    }

    public CustomizationDto save(CustomizationDto request) {
        // Validate the entire request before changing a managed entity.
        String name = text(request.brandName(), 100);
        String color = text(request.brandColor(), 7);
        if (color != null && !color.matches("#[0-9a-fA-F]{6}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte eine gültige HEX-Farbe wählen.");
        }
        String darkColor = text(request.darkBrandColor(), 7);
        if (darkColor != null && !darkColor.matches("#[0-9a-fA-F]{6}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte eine gültige HEX-Farbe wählen.");
        }
        String title = text(request.loginTitle(), 200);
        String message = text(request.loginMessage(), 1000);
        String imprint = url(request.imprintUrl());
        String privacy = url(request.privacyUrl());
        String website = url(request.websiteUrl());
        String support = url(request.supportUrl());
        Customization value = settings();
        value.setBrandName(name);
        value.setBrandColor(color);
        value.setDarkBrandColor(darkColor);
        value.setAdvancedThemeEnabled(request.advancedThemeEnabled());
        value.setLoginTitle(title);
        value.setLoginMessage(message);
        value.setImprintUrl(imprint);
        value.setPrivacyUrl(privacy);
        value.setWebsiteUrl(website);
        value.setSupportUrl(support);
        return response(repository.save(value));
    }

    public CustomizationDto logo(byte[] data) throws IOException {
        return logo(data, BrandingMode.light);
    }

    public CustomizationDto logo(byte[] data, BrandingMode mode) throws IOException {
        if (data == null || data.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte ein Logo auswählen.");
        }
        if (data.length > 5 * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Das Logo darf maximal 5 MB groß sein.");
        }
        validateImageSize(data);
        var image = ImageProcessor.read(data);
        if (image == null || (long) image.getWidth() * image.getHeight() > 25_000_000) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Bitte ein lesbares Rasterbild mit maximal 25 Megapixeln hochladen.");
        }
        var encoded = ImageProcessor.encode(image, 1200);
        Customization value = settings();
        if (mode == BrandingMode.dark) {
            value.setDarkLogo(encoded.data());
            value.setDarkLogoContentType(encoded.contentType());
            value.setDarkLogoVersion(UUID.randomUUID());
        } else {
            value.setLogo(encoded.data());
            value.setLogoContentType(encoded.contentType());
            value.setLogoVersion(UUID.randomUUID());
        }
        return response(repository.save(value));
    }

    public CustomizationDto removeLogo() {
        return removeLogo(BrandingMode.light);
    }

    public CustomizationDto removeLogo(BrandingMode mode) {
        Customization value = settings();
        if (mode == BrandingMode.dark) {
            value.setDarkLogo(null);
            value.setDarkLogoContentType(null);
            value.setDarkLogoVersion(null);
        } else {
            value.setLogo(null);
            value.setLogoContentType(null);
            value.setLogoVersion(null);
        }
        return response(repository.save(value));
    }

    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> image() {
        return image(BrandingMode.light);
    }

    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> image(BrandingMode mode) {
        Customization value = settings();
        byte[] data = mode == BrandingMode.dark ? value.getDarkLogo() : value.getLogo();
        String contentType = mode == BrandingMode.dark ? value.getDarkLogoContentType() : value.getLogoContentType();
        if (data == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noCache())
            .header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.parseMediaType(contentType)).body(data);
    }

    private static CustomizationDto response(Customization value) {
        return new CustomizationDto(value.getBrandName(), value.getBrandColor(), value.getLoginTitle(), value.getLoginMessage(),
            value.getImprintUrl(), value.getPrivacyUrl(), value.getWebsiteUrl(), value.getSupportUrl(),
            value.getLogoVersion() == null ? null : "/api/customization/logo?v=" + value.getLogoVersion(),
            value.getDarkBrandColor(),
            value.getDarkLogoVersion() == null ? null : "/api/customization/logo?mode=dark&v=" + value.getDarkLogoVersion(),
            Boolean.TRUE.equals(value.getAdvancedThemeEnabled()));
    }

    private static String text(String value, int limit) {
        String result = value == null || value.isBlank() ? null : value.trim();
        if (result != null && result.length() > limit) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Der Wert ist zu lang (maximal " + limit + " Zeichen).");
        }
        return result;
    }

    private static void validateImageSize(byte[] data) throws IOException {
        try (var input = javax.imageio.ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            var readers = javax.imageio.ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Die Datei ist kein lesbares Rasterbild.");
            }
            var reader = readers.next();
            try {
                reader.setInput(input);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > 25_000_000) {
                    throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Das Logo darf maximal 25 Megapixel haben.");
                }
            } finally {
                reader.dispose();
            }
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Die Datei ist kein lesbares Rasterbild.", exception);
        }
    }

    private static String url(String value) {
        String result = text(value, 2000);
        if (result == null) {
            return null;
        }
        try {
            URI uri = URI.create(result);
            if (("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                && uri.getHost() != null && uri.getUserInfo() == null) {
                return result;
            }
        } catch (IllegalArgumentException ignored) {
            // Invalid URI syntax is reported with the same validation response.
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Links müssen vollständige HTTP- oder HTTPS-Adressen sein.");
    }
}
