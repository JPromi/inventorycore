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
}
