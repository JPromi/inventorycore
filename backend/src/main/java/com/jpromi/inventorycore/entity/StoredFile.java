package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * An uploaded file. The content lives on disk (see {@code FileStorageService}); this row keeps
 * what was uploaded, when and by whom. Other entities reference files by this row.
 *
 * <p>The uploader is stored as uuid and name instead of a foreign key, so deleting a user keeps
 * the history and does not fail on references.
 */
@Getter
@Setter
@Entity
@Table(name = "stored_files")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class StoredFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    /** File name as sent by the browser. */
    @Column(length = 500)
    private String originalName;

    /** Content type of the stored content (after conversion, e.g. image/jpeg). */
    @Column(nullable = false)
    private String contentType;

    /** Content type the browser sent with the upload. */
    private String originalContentType;

    /** Size of the stored content in bytes. */
    private long size;

    /** Size of the uploaded file in bytes, before scaling. */
    private long originalSize;

    /** Pixel size for images, null for other files. */
    private Integer width;
    private Integer height;

    /** Whether a small preview variant exists next to the content. */
    private boolean hasThumbnail;

    /** Path of the content relative to the storage directory. */
    @Column(nullable = false, length = 500)
    private String storagePath;

    @Builder.Default
    private OffsetDateTime uploadedAt = OffsetDateTime.now();

    private UUID uploadedByUuid;
    private String uploadedByName;

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }

    public boolean isImage() {
        return contentType != null && contentType.startsWith("image/");
    }
}
