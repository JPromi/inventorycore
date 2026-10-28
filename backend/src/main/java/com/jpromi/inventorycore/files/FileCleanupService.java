package com.jpromi.inventorycore.files;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.repository.StoredFileRepository;

/**
 * Removes uploaded files (row and content on disk) that no image or photo references anymore,
 * e.g. after a photo was removed from a protocol or an image from an asset.
 */
@Service
public class FileCleanupService {

    private static final Logger log = LoggerFactory.getLogger(FileCleanupService.class);

    /** Uploads not attached to anything yet (e.g. a form still being filled in) are kept this long. */
    private static final Duration UNATTACHED_GRACE = Duration.ofDays(1);

    private final StoredFileRepository repository;
    private final FileStorageService storage;
    private final TransactionTemplate transaction;

    public FileCleanupService(StoredFileRepository repository, FileStorageService storage, PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.storage = storage;
        this.transaction = new TransactionTemplate(transactionManager);
        // runs after the caller's commit, so it needs its own transaction
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Deletes these files once the current transaction committed (right away without one), as far as
     * nothing references them anymore. A rolled back change keeps its files.
     */
    public void deleteWhenUnused(Collection<StoredFile> files) {
        Set<UUID> uuids = files.stream().filter(Objects::nonNull).map(StoredFile::getUuid).collect(Collectors.toSet());
        if (uuids.isEmpty()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deleteUnused(uuids);
                }
            });
        } else {
            deleteUnused(uuids);
        }
    }

    /**
     * Uploads that were never attached or whose image was removed some other way, including files of
     * photos removed before files were cleaned up immediately.
     */
    @Scheduled(cron = "${app.files.cleanup-cron:0 30 3 * * *}")
    public void deleteAbandoned() {
        try {
            List<StoredFile> removed = transaction.execute(status -> {
                List<StoredFile> unused = repository.findUnattachedUploadedBefore(OffsetDateTime.now().minus(UNATTACHED_GRACE));
                repository.deleteAll(unused);
                return unused;
            });
            removed.forEach(storage::deleteContent);
            if (!removed.isEmpty()) {
                log.info("Deleted {} uploaded files that nothing references", removed.size());
            }
        } catch (RuntimeException exception) {
            log.warn("Could not clean up unused files", exception);
        }
    }

    private void deleteUnused(Set<UUID> uuids) {
        try {
            List<StoredFile> removed = transaction.execute(status -> uuids.stream()
                .map(repository::findByUuid)
                .flatMap(Optional::stream)
                .filter(file -> !repository.isAttached(file))
                .peek(repository::delete)
                .toList());
            // the content goes only after the row is gone, so no row ever points to a missing file
            removed.forEach(storage::deleteContent);
        } catch (RuntimeException exception) {
            // the actual change is committed already; a leftover file is removed by the nightly cleanup
            log.warn("Could not delete files {}", uuids, exception);
        }
    }
}
