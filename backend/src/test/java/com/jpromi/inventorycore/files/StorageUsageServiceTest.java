package com.jpromi.inventorycore.files;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.dto.StorageUsageResponse.UserUsage;
import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.User;

class StorageUsageServiceTest {

    @Test
    void sumsUploadsPerUserIncludingPreviewsAndProfileImage() {
        User anna = user("anna", new byte[300]);
        User ben = user("ben", null);
        OffsetDateTime later = OffsetDateTime.now();
        StoredFile first = file(1, anna.getUuid(), "anna", later.minusDays(2));
        StoredFile second = file(2, anna.getUuid(), "anna", later);
        Map<Long, FileStorageService.DiskSize> sizes = Map.of(
            1L, new FileStorageService.DiskSize(1000, 100),
            2L, new FileStorageService.DiskSize(2000, 200));

        List<UserUsage> usage = StorageUsageService.userUsage(List.of(first, second), sizes, List.of(ben, anna));

        assertThat(usage).extracting(UserUsage::username).containsExactly("anna", "ben");
        UserUsage annaUsage = usage.get(0);
        assertThat(annaUsage.fileCount()).isEqualTo(2);
        assertThat(annaUsage.fileSize()).isEqualTo(3300);
        assertThat(annaUsage.originalSize()).isEqualTo(10_000);
        assertThat(annaUsage.profileImageSize()).isEqualTo(300);
        assertThat(annaUsage.lastUploadAt()).isEqualTo(later);
        assertThat(usage.get(1).fileCount()).isZero();
        assertThat(usage.get(1).totalSize()).isZero();
    }

    @Test
    void keepsUploadsOfDeletedAndUnknownUploaders() {
        UUID deletedUser = UUID.randomUUID();
        StoredFile ofDeleted = file(1, deletedUser, "former", OffsetDateTime.now());
        StoredFile withoutUploader = file(2, null, null, OffsetDateTime.now());
        Map<Long, FileStorageService.DiskSize> sizes = Map.of(
            1L, new FileStorageService.DiskSize(500, 50),
            2L, new FileStorageService.DiskSize(100, 10));

        List<UserUsage> usage = StorageUsageService.userUsage(List.of(ofDeleted, withoutUploader), sizes, List.of());

        assertThat(usage).hasSize(2);
        assertThat(usage.get(0).uuid()).isEqualTo(deletedUser);
        assertThat(usage.get(0).username()).isEqualTo("former");
        assertThat(usage.get(0).deleted()).isTrue();
        assertThat(usage.get(0).fileSize()).isEqualTo(550);
        assertThat(usage.get(1).uuid()).isNull();
        assertThat(usage.get(1).deleted()).isFalse();
        assertThat(usage.get(1).fileSize()).isEqualTo(110);
    }

    private static User user(String name, byte[] profileImage) {
        User user = User.builder().username(name).displayName(name).build();
        user.setProfileImage(profileImage);
        return user;
    }

    private static StoredFile file(long id, UUID uploader, String uploaderName, OffsetDateTime uploadedAt) {
        return StoredFile.builder().id(id).contentType("image/jpeg").storagePath("2026/10/" + id)
            .size(1).originalSize(5_000).uploadedAt(uploadedAt).uploadedByUuid(uploader).uploadedByName(uploaderName).build();
    }
}
