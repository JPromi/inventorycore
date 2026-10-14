package com.jpromi.inventorycore.files;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.repository.StoredFileRepository;

/**
 * Stores uploaded files on disk below {@code app.files.path}, one directory per month:
 * {@code 2026/10/<uuid>} for the content and {@code 2026/10/<uuid>_thumb} for the preview.
 * Images are scaled down to {@code app.files.image-max-size} pixels; other files are kept as they are.
 */
@Service
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    public static final String THUMBNAIL_SUFFIX = "_thumb";

    /** Images the browser may send; everything else is rejected for now. SVG is excluded on purpose (scripts). */
    private static final Set<String> IMAGE_TYPES = Set.of(
        "image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp", "image/tiff");

    private final StoredFileRepository repository;
    private final Path root;
    private final int imageMaxSize;
    private final int thumbnailSize;

    public FileStorageService(
        StoredFileRepository repository,
        @Value("${app.files.path:data/files}") String root,
        @Value("${app.files.image-max-size:1920}") int imageMaxSize,
        @Value("${app.files.thumbnail-size:400}") int thumbnailSize
    ) {
        this.repository = repository;
        this.root = Path.of(root).toAbsolutePath().normalize();
        this.imageMaxSize = imageMaxSize;
        this.thumbnailSize = thumbnailSize;
        log.info("Uploaded files are stored in {}", this.root);
    }

    @Transactional
    public StoredFile storeImage(MultipartFile upload, User uploader) {
        if (upload == null || upload.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Keine Datei erhalten.");
        }
        String browserType = upload.getContentType() == null ? "" : upload.getContentType().toLowerCase(Locale.ROOT);
        if (!IMAGE_TYPES.contains(browserType)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "Dateityp wird nicht unterstützt. Erlaubt sind JPEG, PNG, GIF, WebP, BMP und TIFF.");
        }

        byte[] data;
        try {
            data = upload.getBytes();
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
        BufferedImage image = ImageProcessor.read(data);
        if (image == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Die Datei ist kein lesbares Bild.");
        }

        UUID uuid = UUID.randomUUID();
        LocalDate today = LocalDate.now();
        String relativePath = "%d/%02d/%s".formatted(today.getYear(), today.getMonthValue(), uuid);
        try {
            ImageProcessor.Encoded content = ImageProcessor.encode(image, imageMaxSize);
            ImageProcessor.Encoded thumbnail = ImageProcessor.encode(image, thumbnailSize);
            write(relativePath, content.data());
            write(relativePath + THUMBNAIL_SUFFIX, thumbnail.data());

            StoredFile file = StoredFile.builder()
                .uuid(uuid)
                .originalName(cleanName(upload.getOriginalFilename()))
                .contentType(content.contentType())
                .originalContentType(browserType)
                .size(content.data().length)
                .originalSize(upload.getSize())
                .width(content.width())
                .height(content.height())
                .hasThumbnail(true)
                .storagePath(relativePath)
                .uploadedByUuid(uploader == null ? null : uploader.getUuid())
                .uploadedByName(uploader == null ? null : uploader.getUsername())
                .build();
            return repository.save(file);
        } catch (IOException exception) {
            delete(relativePath);
            throw new UncheckedIOException(exception);
        } catch (RuntimeException exception) {
            delete(relativePath);
            throw exception;
        }
    }

    /** Path of the content or the preview; the preview falls back to the content. */
    public Path path(StoredFile file, boolean thumbnail) {
        Path content = resolve(file.getStoragePath());
        if (thumbnail && file.isHasThumbnail()) {
            Path preview = resolve(file.getStoragePath() + THUMBNAIL_SUFFIX);
            if (Files.exists(preview)) {
                return preview;
            }
        }
        return content;
    }

    private void write(String relativePath, byte[] data) throws IOException {
        Path target = resolve(relativePath);
        Files.createDirectories(target.getParent());
        // write to a temp file first, so a crash never leaves a half written file behind
        Path temp = Files.createTempFile(target.getParent(), "upload-", ".tmp");
        Files.write(temp, data);
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private void delete(String relativePath) {
        try {
            Files.deleteIfExists(resolve(relativePath));
            Files.deleteIfExists(resolve(relativePath + THUMBNAIL_SUFFIX));
        } catch (IOException exception) {
            log.warn("Could not clean up {}", relativePath, exception);
        }
    }

    private Path resolve(String relativePath) {
        Path path = root.resolve(relativePath).normalize();
        if (!path.startsWith(root)) {
            throw new IllegalArgumentException("Invalid storage path");
        }
        return path;
    }

    private static String cleanName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        // browsers on Windows may send the full path
        String base = name.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1);
        return base.length() > 255 ? base.substring(0, 255) : base;
    }
}
