package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetInspectionSchedule;
import com.jpromi.inventorycore.entity.InspectionType;

public interface AssetInspectionScheduleRepository extends JpaRepository<AssetInspectionSchedule, Long> {
    Optional<AssetInspectionSchedule> findByAssetAndInspectionType(Asset asset, InspectionType inspectionType);

    List<AssetInspectionSchedule> findByAsset(Asset asset);

    @Modifying
    @Query("delete from AssetInspectionSchedule s where s.inspectionType = :type")
    void deleteByInspectionType(@Param("type") InspectionType type);
}
