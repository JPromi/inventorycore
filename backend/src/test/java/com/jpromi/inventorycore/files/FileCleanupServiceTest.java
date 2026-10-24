package com.jpromi.inventorycore.files;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.repository.StoredFileRepository;

class FileCleanupServiceTest {

    private final StoredFileRepository repository = mock(StoredFileRepository.class);
    private final FileStorageService storage = mock(FileStorageService.class);
    private final FileCleanupService cleanup = new FileCleanupService(repository, storage, mock(PlatformTransactionManager.class));

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void deletesRemovedPhotoButKeepsFilesStillInUse() {
        StoredFile removed = file("removed");
        StoredFile stillUsed = file("used");
        when(repository.findByUuid(removed.getUuid())).thenReturn(Optional.of(removed));
        when(repository.findByUuid(stillUsed.getUuid())).thenReturn(Optional.of(stillUsed));
        when(repository.isAttached(removed)).thenReturn(false);
        when(repository.isAttached(stillUsed)).thenReturn(true);

        cleanup.deleteWhenUnused(List.of(removed, stillUsed));

        verify(repository).delete(removed);
        verify(storage).deleteContent(removed);
        verify(repository, never()).delete(stillUsed);
        verify(storage, never()).deleteContent(stillUsed);
    }

    @Test
    void waitsForTheCommitOfTheDeletingTransaction() {
        StoredFile photo = file("photo");
        when(repository.findByUuid(photo.getUuid())).thenReturn(Optional.of(photo));
        TransactionSynchronizationManager.initSynchronization();

        cleanup.deleteWhenUnused(List.of(photo));
        verify(repository, never()).delete(any(StoredFile.class));

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(repository).delete(photo);
        verify(storage).deleteContent(photo);
    }

    @Test
    void nightlyCleanupDeletesUnattachedUploads() {
        StoredFile abandoned = file("abandoned");
        when(repository.findUnattachedUploadedBefore(any())).thenReturn(List.of(abandoned));

        cleanup.deleteAbandoned();

        verify(repository).deleteAll(List.of(abandoned));
        verify(storage).deleteContent(abandoned);
    }

    private static StoredFile file(String name) {
        return StoredFile.builder().originalName(name).contentType("image/jpeg").storagePath("2026/" + name + ".jpg").build();
    }
}
