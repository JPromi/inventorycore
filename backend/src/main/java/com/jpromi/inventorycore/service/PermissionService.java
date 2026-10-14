package com.jpromi.inventorycore.service;

import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.GroupPermissionRepository;

@Service
public class PermissionService {

    private final AppUserRepository userRepository;
    private final GroupPermissionRepository permissionRepository;

    public PermissionService(AppUserRepository userRepository, GroupPermissionRepository permissionRepository) {
        this.userRepository = userRepository;
        this.permissionRepository = permissionRepository;
    }

    public void requireView(Authentication authentication, PermissionResourceType resourceType, UUID resourceUuid) {
        require(authentication, resourceType, resourceUuid, permission -> permission.isCanView() || permission.isAdmin());
    }

    public void requireCreate(Authentication authentication, PermissionResourceType resourceType) {
        require(authentication, resourceType, null, permission -> permission.isCanCreate() || permission.isAdmin());
    }

    public void requireEdit(Authentication authentication, PermissionResourceType resourceType, UUID resourceUuid) {
        require(authentication, resourceType, resourceUuid, permission -> permission.isCanEdit() || permission.isAdmin());
    }

    public void requireDelete(Authentication authentication, PermissionResourceType resourceType, UUID resourceUuid) {
        require(authentication, resourceType, resourceUuid, permission -> permission.isCanDelete() || permission.isAdmin());
    }

    private void require(Authentication authentication, PermissionResourceType resourceType, UUID resourceUuid, Predicate<GroupPermission> rule) {
        User user = currentUser(authentication);
        if ("ADMIN".equalsIgnoreCase(user.getRole())) {
            return;
        }

        List<GroupPermission> permissions = permissionRepository.findByGroupInAndResourceType(
            user.getGroups().stream().toList(),
            resourceType
        );

        boolean allowed = permissions.stream()
            .filter(permission -> appliesToResource(permission, resourceUuid))
            .anyMatch(rule);

        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Missing permission");
        }
    }

    private boolean appliesToResource(GroupPermission permission, UUID resourceUuid) {
        return permission.getResourceUuid() == null || permission.getResourceUuid().equals(resourceUuid);
    }

    private User currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }

        return userRepository.findByUsername(authentication.getName())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
