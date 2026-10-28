package com.jpromi.inventorycore.files;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.dto.StorageUsageResponse;
import com.jpromi.inventorycore.dto.StorageUsageResponse.DatabaseUsage;
import com.jpromi.inventorycore.dto.StorageUsageResponse.FileUsage;
import com.jpromi.inventorycore.dto.StorageUsageResponse.TableUsage;
import com.jpromi.inventorycore.dto.StorageUsageResponse.UserUsage;
import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.StoredFileRepository;

/**
 * How much storage the database and the uploaded files take, and how much of it each user uploaded.
 * File sizes are read from disk (content and preview), so they match what the storage directory needs.
 */
@Service
public class StorageUsageService {

    /** Groups uploads without uploader (e.g. created by the system). */
    private static final UUID UNKNOWN = new UUID(0, 0);

    private final JdbcTemplate jdbc;
    private final StoredFileRepository fileRepository;
    private final AppUserRepository userRepository;
    private final FileStorageService storage;

    public StorageUsageService(JdbcTemplate jdbc, StoredFileRepository fileRepository, AppUserRepository userRepository, FileStorageService storage) {
        this.jdbc = jdbc;
        this.fileRepository = fileRepository;
        this.userRepository = userRepository;
        this.storage = storage;
    }

    @Transactional(readOnly = true)
    public StorageUsageResponse usage() {
        List<StoredFile> files = fileRepository.findAll();
        Map<Long, FileStorageService.DiskSize> sizes = new HashMap<>();
        files.forEach(file -> sizes.put(file.getId(), storage.diskSize(file)));
        Set<Long> unattached = fileRepository.findUnattachedUploadedBefore(OffsetDateTime.now()).stream()
            .map(StoredFile::getId).collect(Collectors.toSet());
        return new StorageUsageResponse(database(), fileUsage(files, sizes, unattached), userUsage(files, sizes, userRepository.findAll()));
    }

    private DatabaseUsage database() {
        Long size = jdbc.queryForObject("select pg_database_size(current_database())", Long.class);
        // ordinary and partitioned tables of the application schema, with indexes and TOAST data
        List<TableUsage> tables = jdbc.query("""
            select c.relname as name, pg_total_relation_size(c.oid) as size, c.reltuples::bigint as rows
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r', 'p') and n.nspname = current_schema()
            order by size desc, name
            """, (row, index) -> new TableUsage(row.getString("name"), row.getLong("size"), Math.max(-1, row.getLong("rows"))));
        return new DatabaseUsage(size == null ? 0 : size, tables);
    }

    private FileUsage fileUsage(List<StoredFile> files, Map<Long, FileStorageService.DiskSize> sizes, Set<Long> unattached) {
        long content = 0;
        long preview = 0;
        long original = 0;
        long unattachedCount = 0;
        long unattachedSize = 0;
        for (StoredFile file : files) {
            FileStorageService.DiskSize size = sizes.get(file.getId());
            content += size.content();
            preview += size.preview();
            original += file.getOriginalSize();
            if (unattached.contains(file.getId())) {
                unattachedCount++;
                unattachedSize += size.content() + size.preview();
            }
        }
        var volume = storage.volumeSpace();
        return new FileUsage(files.size(), content, preview, original, unattachedCount, unattachedSize,
            volume.map(FileStorageService.VolumeSpace::total).orElse(null),
            volume.map(FileStorageService.VolumeSpace::usable).orElse(null));
    }

    /**
     * One entry per existing user (also without uploads) and per deleted uploader; uploads keep the
     * uploader's uuid and name, so they are still assigned after the user was deleted.
     */
    static List<UserUsage> userUsage(Collection<StoredFile> files, Map<Long, FileStorageService.DiskSize> sizes, Collection<User> users) {
        Map<UUID, User> usersByUuid = users.stream().collect(Collectors.toMap(User::getUuid, user -> user));
        Map<UUID, List<StoredFile>> filesByUploader = files.stream()
            .collect(Collectors.groupingBy(file -> file.getUploadedByUuid() == null ? UNKNOWN : file.getUploadedByUuid(),
                LinkedHashMap::new, Collectors.toList()));

        List<UserUsage> result = new ArrayList<>();
        for (User user : users) {
            byte[] image = user.getProfileImage();
            result.add(entry(user.getUuid(), user.getUsername(), user.getDisplayName(), false,
                filesByUploader.getOrDefault(user.getUuid(), List.of()), sizes, image == null ? 0 : image.length));
        }
        filesByUploader.forEach((uploader, uploads) -> {
            if (usersByUuid.containsKey(uploader)) {
                return;
            }
            boolean known = !UNKNOWN.equals(uploader);
            String name = uploads.stream().map(StoredFile::getUploadedByName).filter(Objects::nonNull).findFirst().orElse(null);
            result.add(entry(known ? uploader : null, known ? name : null, known ? name : null, known, uploads, sizes, 0));
        });
        result.sort(Comparator.comparingLong(UserUsage::totalSize).reversed()
            .thenComparing(usage -> usage.displayName() == null ? "" : usage.displayName(), String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    private static UserUsage entry(UUID uuid, String username, String displayName, boolean deleted, List<StoredFile> uploads,
        Map<Long, FileStorageService.DiskSize> sizes, long profileImageSize) {
        long fileSize = 0;
        long originalSize = 0;
        OffsetDateTime lastUpload = null;
        for (StoredFile file : uploads) {
            FileStorageService.DiskSize size = sizes.get(file.getId());
            fileSize += size == null ? file.getSize() : size.content() + size.preview();
            originalSize += file.getOriginalSize();
            if (file.getUploadedAt() != null && (lastUpload == null || file.getUploadedAt().isAfter(lastUpload))) {
                lastUpload = file.getUploadedAt();
            }
        }
        return new UserUsage(uuid, username, displayName, deleted, uploads.size(), fileSize, originalSize, profileImageSize, lastUpload);
    }
}
