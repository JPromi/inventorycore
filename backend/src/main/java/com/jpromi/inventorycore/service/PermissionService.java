package com.jpromi.inventorycore.service;

import java.util.Collection;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.GroupPermissionRepository;

@Service
public class PermissionService {

    private final AppUserRepository userRepository;
    private final GroupPermissionRepository permissionRepository;
    private final com.jpromi.inventorycore.repository.GroupRepository groupRepository;

    public PermissionService(
        AppUserRepository userRepository,
        GroupPermissionRepository permissionRepository,
        com.jpromi.inventorycore.repository.GroupRepository groupRepository
    ) {
        this.userRepository = userRepository;
        this.permissionRepository = permissionRepository;
        this.groupRepository = groupRepository;
    }

    /** Permissions of the user's groups and of the group "Alle Benutzer", which everyone belongs to. */
    public java.util.List<com.jpromi.inventorycore.entity.GroupPermission> permissionsOf(User user) {
        java.util.List<com.jpromi.inventorycore.entity.Group> groups = new java.util.ArrayList<>(user.getGroups());
        groupRepository.findFirstByEveryoneTrue()
            .filter(everyone -> groups.stream().noneMatch(group -> group.getId().equals(everyone.getId())))
            .ifPresent(groups::add);
        return groups.isEmpty() ? java.util.List.of() : permissionRepository.findByGroupIn(groups);
    }

    public AccessContext context(Authentication authentication) {
        User user = currentUser(authentication);
        boolean admin = user.isAdmin();
        return new AccessContext(admin, admin ? java.util.List.of() : permissionsOf(user));
    }

    public static void require(boolean allowed) {
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Für diese Aktion fehlt die Berechtigung.");
        }
    }

    public static void require(AccessContext context, PermissionResourceType type, PermissionAction action, Collection<Area> areas) {
        require(context.can(type, action, areas));
    }

    public User currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bitte anmelden.");
        }

        return userRepository.findByUsername(authentication.getName())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Benutzer nicht gefunden."));
    }
}
