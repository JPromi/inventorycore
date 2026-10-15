package com.jpromi.inventorycore.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.files.ImageProcessor;

public final class ProfileImageService {
    private ProfileImageService() {}

    public static void setImage(User user, byte[] data) {
        if (data == null || data.length == 0) {
            user.setProfileImage(null);
            user.setProfileImageContentType(null);
            user.setProfileImageVersion(null);
            return;
        }
        if (data.length > 5 * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Profilbild darf maximal 5 MB gross sein.");
        }
        var image = ImageProcessor.read(data);
        if (image == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Die Datei ist kein lesbares Bild.");
        }
        try {
            var encoded = ImageProcessor.encode(image, 400);
            user.setProfileImage(encoded.data());
            user.setProfileImageContentType(encoded.contentType());
            user.setProfileImageVersion(UUID.randomUUID());
            user.setProfileImageUrl(null);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
