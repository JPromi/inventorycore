package com.jpromi.inventorycore.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetStatusChange;

public interface AssetStatusChangeRepository extends JpaRepository<AssetStatusChange, Long> {
    List<AssetStatusChange> findByAssetOrderByChangedAtDescIdDesc(Asset asset);
}
