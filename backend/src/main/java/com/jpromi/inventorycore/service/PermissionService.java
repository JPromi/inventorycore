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

    public PermissionService(AppUserRepository userRepository, GroupPermissionRepository permissionRepository) {
        this.userRepository = userRepository;
        this.permissionRepository = permissionRepository;
    }

    public AccessContext context(Authentication authentication) {
        User user = currentUser(authentication);
        boolean admin = user.isAdmin();
        return new AccessContext(admin, admin ? java.util.List.of() : permissionRepository.findByGroupIn(user.getGroups().stream().toList()));
    }

    public static void require(boolean allowed) {
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Missing permission");
        }
    }

    public static void require(AccessContext context, PermissionResourceType type, PermissionAction action, Collection<Area> areas) {
        require(context.can(type, action, areas));
    }

    public User currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }

        return userRepository.findByUsername(authentication.getName())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
