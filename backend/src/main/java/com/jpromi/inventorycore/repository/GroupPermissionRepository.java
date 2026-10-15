package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.GroupPermission;

public interface GroupPermissionRepository extends JpaRepository<GroupPermission, Long> {
    Optional<GroupPermission> findByUuid(UUID uuid);
    List<GroupPermission> findByGroupIn(List<Group> groups);
    List<GroupPermission> findByArea(Area area);
}
