package com.jpromi.inventorycore.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Storage used by the database and the uploaded files, for administrators. All sizes in bytes. */
public record StorageUsageResponse(
    DatabaseUsage database,
    FileUsage files,
    /** uploads and profile image per user, most storage first; includes deleted users who uploaded files */
    List<UserUsage> users
) {
    /** {@code size} of the whole database; {@code tables} largest first (with indexes and TOAST data). */
    public record DatabaseUsage(long size, List<TableUsage> tables) {}

    /** {@code rows} is PostgreSQL's estimate, -1 if the table was never analyzed. */
    public record TableUsage(String name, long size, long rows) {}

    /**
     * Uploaded files on disk. {@code contentSize} + {@code previewSize} is what the files take;
     * {@code originalSize} is what was uploaded before images were scaled down. {@code unattached*}
     * are files nothing references (removed by the nightly cleanup after a day).
     * {@code volumeTotal} / {@code volumeUsable} describe the drive of the storage directory, null if unknown.
     */
    public record FileUsage(
        long count,
        long contentSize,
        long previewSize,
        long originalSize,
        long unattachedCount,
        long unattachedSize,
        Long volumeTotal,
        Long volumeUsable
    ) {}

    /**
     * {@code uuid} / {@code username} null for uploads without known uploader; {@code deleted} for
     * uploaders whose user no longer exists. {@code fileSize} includes the previews.
     */
    public record UserUsage(
        UUID uuid,
        String username,
        String displayName,
        boolean deleted,
        long fileCount,
        long fileSize,
        long originalSize,
        long profileImageSize,
        OffsetDateTime lastUploadAt
    ) {
        public long totalSize() {
            return fileSize + profileImageSize;
        }
    }
}
