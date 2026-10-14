package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.enums.PermissionResourceType;

public interface GroupPermissionRepository extends JpaRepository<GroupPermission, Long> {
    Optional<GroupPermission> findByUuid(UUID uuid);
    List<GroupPermission> findByGroupInAndResourceType(List<Group> groups, PermissionResourceType resourceType);
}
