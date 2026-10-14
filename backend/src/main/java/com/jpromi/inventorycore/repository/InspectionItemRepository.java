package com.jpromi.inventorycore.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.InspectionItem;

public interface InspectionItemRepository extends JpaRepository<InspectionItem, Long> {

    /** Every inspection the asset appeared in (expected or found as foreign object), newest first. */
    @Query("""
        select item from InspectionItem item join fetch item.inspection inspection
        where item.asset = :asset
        order by inspection.createdAt desc
        """)
    List<InspectionItem> findByAsset(@Param("asset") Asset asset);

    /**
     * Last check per asset and inspection type: [asset id, inspection type id, status, checked at,
     * checked by]. Only checked items; the caller keeps the newest per pair.
     */
    @Query("""
        select item.asset.id, inspection.inspectionType.id, item.status, item.checkedAt, item.checkedByName
        from InspectionItem item join item.inspection inspection
        where item.asset is not null and inspection.inspectionType is not null and item.checkedAt is not null
          and item.status in (com.jpromi.inventorycore.enums.InspectionItemStatus.PRESENT,
                              com.jpromi.inventorycore.enums.InspectionItemStatus.PASSED,
                              com.jpromi.inventorycore.enums.InspectionItemStatus.FAILED)
        """)
    List<Object[]> findChecks();
}
