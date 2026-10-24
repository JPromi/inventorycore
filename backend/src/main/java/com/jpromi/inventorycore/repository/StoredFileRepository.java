package com.jpromi.inventorycore.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.InspectionItem;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.StoredFile;

public interface StoredFileRepository extends JpaRepository<StoredFile, Long> {
    Optional<StoredFile> findByUuid(UUID uuid);

    @Query("select distinct a from Asset a join a.images i where i.file = :file")
    List<Asset> assetsUsing(@Param("file") StoredFile file);

    @Query("select distinct l from Location l join l.images i where i.file = :file")
    List<Location> locationsUsing(@Param("file") StoredFile file);

    @Query("select distinct t from AssetType t join t.images i where i.file = :file")
    List<AssetType> assetTypesUsing(@Param("file") StoredFile file);

    @Query("select distinct p.item from InspectionItemPhoto p where p.file = :file")
    List<InspectionItem> inspectionItemsUsing(@Param("file") StoredFile file);

    /** Uploaded before {@code before} and not referenced by any image or photo. */
    @Query("""
        select f from StoredFile f
        where (f.uploadedAt is null or f.uploadedAt < :before)
          and not exists (select 1 from AssetImage i where i.file = f)
          and not exists (select 1 from LocationImage i where i.file = f)
          and not exists (select 1 from AssetTypeImage i where i.file = f)
          and not exists (select 1 from InspectionItemPhoto p where p.file = f)
        """)
    List<StoredFile> findUnattachedUploadedBefore(@Param("before") OffsetDateTime before);

    /** Attached to any object (image of an asset, location or type, or protocol photo). */
    default boolean isAttached(StoredFile file) {
        return !assetsUsing(file).isEmpty() || !locationsUsing(file).isEmpty()
            || !assetTypesUsing(file).isEmpty() || !inspectionItemsUsing(file).isEmpty();
    }
}
