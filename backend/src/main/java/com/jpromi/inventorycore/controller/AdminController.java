package com.jpromi.inventorycore.controller;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.GroupPermissionRequest;
import com.jpromi.inventorycore.dto.GroupPermissionResponse;
import com.jpromi.inventorycore.dto.GroupRequest;
import com.jpromi.inventorycore.dto.GroupResponse;
import com.jpromi.inventorycore.dto.UserRequest;
import com.jpromi.inventorycore.dto.UserResponse;
import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.GroupPermissionRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.service.ApiMapper;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AppUserRepository userRepository;
    private final GroupRepository groupRepository;
    private final GroupPermissionRepository permissionRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApiMapper mapper;

    public AdminController(
        AppUserRepository userRepository,
        GroupRepository groupRepository,
        GroupPermissionRepository permissionRepository,
        PasswordEncoder passwordEncoder,
        ApiMapper mapper
    ) {
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
        this.permissionRepository = permissionRepository;
        this.passwordEncoder = passwordEncoder;
        this.mapper = mapper;
    }

    @GetMapping("/users")
    public List<UserResponse> users() {
        return userRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse createUser(@RequestBody UserRequest request) {
        User user = User.builder()
            .username(request.username())
            .displayName(request.displayName())
            .password(passwordEncoder.encode(request.password()))
            .email(request.email())
            .role(request.role() == null ? "USER" : request.role())
            .enabled(request.enabled())
            .sourceProvider(Provider.LOCAL)
            .groups(resolveGroups(request))
            .build();
        return mapper.toResponse(userRepository.save(user));
    }

    @PatchMapping("/users/{uuid}")
    public UserResponse updateUser(@PathVariable UUID uuid, @RequestBody UserRequest request) {
        User user = user(uuid);
        user.setUsername(request.username());
        user.setDisplayName(request.displayName());
        user.setEmail(request.email());
        user.setRole(request.role() == null ? user.getRole() : request.role());
        user.setEnabled(request.enabled());
        if (request.password() != null && !request.password().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.password()));
        }
        user.setGroups(resolveGroups(request));
        return mapper.toResponse(userRepository.save(user));
    }

    @DeleteMapping("/users/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable UUID uuid) {
        userRepository.delete(user(uuid));
    }

    @GetMapping("/groups")
    public List<GroupResponse> groups() {
        return groupRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @PostMapping("/groups")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupResponse createGroup(@RequestBody GroupRequest request) {
        Group group = Group.builder()
            .name(request.name())
            .sourceProvider(Provider.LOCAL)
            .build();
        applyPermissions(group, request);
        return mapper.toResponse(groupRepository.save(group));
    }

    @PatchMapping("/groups/{uuid}")
    public GroupResponse updateGroup(@PathVariable UUID uuid, @RequestBody GroupRequest request) {
        Group group = group(uuid);
        group.setName(request.name());
        group.getPermissions().clear();
        applyPermissions(group, request);
        return mapper.toResponse(groupRepository.save(group));
    }

    @DeleteMapping("/groups/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteGroup(@PathVariable UUID uuid) {
        groupRepository.delete(group(uuid));
    }

    @PostMapping("/groups/{groupUuid}/permissions")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupPermissionResponse createPermission(@PathVariable UUID groupUuid, @RequestBody GroupPermissionRequest request) {
        Group group = group(groupUuid);
        GroupPermission permission = permission(group, request);
        group.getPermissions().add(permission);
        groupRepository.save(group);
        return mapper.toResponse(permission);
    }

    @PatchMapping("/permissions/{uuid}")
    public GroupPermissionResponse updatePermission(@PathVariable UUID uuid, @RequestBody GroupPermissionRequest request) {
        GroupPermission permission = permissionRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Permission not found"));
        applyPermission(permission, request);
        return mapper.toResponse(permissionRepository.save(permission));
    }

    @DeleteMapping("/permissions/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePermission(@PathVariable UUID uuid) {
        GroupPermission permission = permissionRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Permission not found"));
        permissionRepository.delete(permission);
    }

    private User user(UUID uuid) {
        return userRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private Group group(UUID uuid) {
        return groupRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found"));
    }

    private HashSet<Group> resolveGroups(UserRequest request) {
        HashSet<Group> groups = new HashSet<>();
        if (request.groupUuids() == null) {
            return groups;
        }
        request.groupUuids().forEach(groupUuid -> groups.add(group(groupUuid)));
        return groups;
    }

    private void applyPermissions(Group group, GroupRequest request) {
        if (request.permissions() == null) {
            return;
        }
        request.permissions().forEach(permissionRequest -> group.getPermissions().add(permission(group, permissionRequest)));
    }

    private GroupPermission permission(Group group, GroupPermissionRequest request) {
        GroupPermission permission = GroupPermission.builder().group(group).build();
        applyPermission(permission, request);
        return permission;
    }

    private void applyPermission(GroupPermission permission, GroupPermissionRequest request) {
        permission.setResourceType(request.resourceType());
        permission.setResourceUuid(request.resourceUuid());
        permission.setCanView(request.canView());
        permission.setCanEdit(request.canEdit());
        permission.setCanInspect(request.canInspect());
        permission.setCanDelete(request.canDelete());
        permission.setAdmin(request.admin());
        permission.setCanCreate(request.canCreate());
    }
}
