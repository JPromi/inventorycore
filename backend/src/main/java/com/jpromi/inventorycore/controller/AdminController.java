package com.jpromi.inventorycore.controller;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
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

import com.jpromi.inventorycore.dto.AreaRequest;
import com.jpromi.inventorycore.dto.AreaResponse;
import com.jpromi.inventorycore.dto.GroupPermissionRequest;
import com.jpromi.inventorycore.dto.GroupPermissionResponse;
import com.jpromi.inventorycore.dto.GroupRequest;
import com.jpromi.inventorycore.dto.GroupResponse;
import com.jpromi.inventorycore.dto.UserRequest;
import com.jpromi.inventorycore.dto.UserResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LabelTemplateRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.repository.GroupPermissionRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.service.ApiMapper;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AppUserRepository userRepository;
    private final GroupRepository groupRepository;
    private final GroupPermissionRepository permissionRepository;
    private final AreaRepository areaRepository;
    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LabelTemplateRepository labelTemplateRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApiMapper mapper;

    public AdminController(
        AppUserRepository userRepository,
        GroupRepository groupRepository,
        GroupPermissionRepository permissionRepository,
        AreaRepository areaRepository,
        AssetRepository assetRepository,
        LocationRepository locationRepository,
        AssetTypeRepository assetTypeRepository,
        LabelTemplateRepository labelTemplateRepository,
        PasswordEncoder passwordEncoder,
        ApiMapper mapper
    ) {
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
        this.permissionRepository = permissionRepository;
        this.areaRepository = areaRepository;
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.labelTemplateRepository = labelTemplateRepository;
        this.passwordEncoder = passwordEncoder;
        this.mapper = mapper;
    }

    // ---- areas ----

    @GetMapping("/areas")
    public List<AreaResponse> areas() {
        return areaRepository.findAll().stream()
            .sorted(Comparator.comparing(Area::isDefaultArea).reversed().thenComparing(Area::getName, String.CASE_INSENSITIVE_ORDER))
            .map(this::toAreaResponse)
            .toList();
    }

    @PostMapping("/areas")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public AreaResponse createArea(@RequestBody AreaRequest request) {
        Area area = Area.builder().build();
        applyArea(area, request);
        return toAreaResponse(areaRepository.save(area));
    }

    @PatchMapping("/areas/{uuid}")
    @Transactional
    public AreaResponse updateArea(@PathVariable UUID uuid, @RequestBody AreaRequest request) {
        Area area = area(uuid);
        if (area.isDefaultArea() && !request.defaultArea()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose another default area instead");
        }
        applyArea(area, request);
        return toAreaResponse(areaRepository.save(area));
    }

    /**
     * Deletes an area. Objects that were only in this area move to the default area,
     * permissions for this area are removed.
     */
    @DeleteMapping("/areas/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteArea(@PathVariable UUID uuid) {
        Area area = area(uuid);
        if (area.isDefaultArea()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The default area cannot be deleted");
        }
        Area defaultArea = areaRepository.findFirstByDefaultAreaTrue()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No default area configured"));

        assetRepository.findByArea(area).forEach(asset -> moveOut(asset.getAreas(), area, defaultArea));
        locationRepository.findByArea(area).forEach(location -> moveOut(location.getAreas(), area, defaultArea));
        assetTypeRepository.findByArea(area).forEach(type -> moveOut(type.getAreas(), area, defaultArea));
        labelTemplateRepository.findByArea(area).forEach(template -> {
            template.setArea(defaultArea);
            template.setDefaultForArea(false);
        });
        permissionRepository.findByArea(area).forEach(permission -> permission.getGroup().getPermissions().remove(permission));
        permissionRepository.flush();
        areaRepository.delete(area);
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
    public void deleteUser(@PathVariable UUID uuid, Authentication authentication) {
        User user = user(uuid);
        if (authentication != null && user.getUsername().equals(authentication.getName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot delete your own user");
        }
        userRepository.delete(user);
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
            .adminGroup(request.adminGroup())
            .build();
        applyPermissions(group, request);
        return mapper.toResponse(groupRepository.save(group));
    }

    @PatchMapping("/groups/{uuid}")
    @Transactional
    public GroupResponse updateGroup(@PathVariable UUID uuid, @RequestBody GroupRequest request) {
        Group group = group(uuid);
        // names of LDAP / OIDC groups are managed by the provider
        if (group.getSourceProvider() == Provider.LOCAL) {
            group.setName(request.name());
        }
        group.setAdminGroup(request.adminGroup());
        group.getPermissions().clear();
        // delete old permissions before inserting new ones, otherwise the unique constraint fails
        groupRepository.flush();
        applyPermissions(group, request);
        return mapper.toResponse(groupRepository.save(group));
    }

    @DeleteMapping("/groups/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteGroup(@PathVariable UUID uuid) {
        Group group = group(uuid);
        group.getUsers().forEach(user -> user.getGroups().remove(group));
        group.getUsers().clear();
        groupRepository.delete(group);
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

    private void applyArea(Area area, AreaRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        area.setName(request.name().trim());
        area.setDescription(request.description());
        area.setColor(request.color());
        if (request.defaultArea() && !area.isDefaultArea()) {
            // there is always exactly one default area
            areaRepository.findFirstByDefaultAreaTrue().ifPresent(previous -> {
                previous.setDefaultArea(false);
                areaRepository.saveAndFlush(previous);
            });
            area.setDefaultArea(true);
        }
    }

    private AreaResponse toAreaResponse(Area area) {
        return mapper.toResponse(
            area,
            assetRepository.countByArea(area),
            locationRepository.countByArea(area),
            assetTypeRepository.countByArea(area)
        );
    }

    private static void moveOut(Set<Area> areas, Area removed, Area defaultArea) {
        areas.removeIf(entry -> entry.getId().equals(removed.getId()));
        if (areas.isEmpty()) {
            areas.add(defaultArea);
        }
    }

    private Area area(UUID uuid) {
        return areaRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Area not found"));
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
        permission.setArea(request.areaUuid() == null ? null : area(request.areaUuid()));
        permission.setCanView(request.canView());
        permission.setCanEdit(request.canEdit());
        permission.setCanInspect(request.canInspect());
        permission.setCanDelete(request.canDelete());
        permission.setAdmin(request.admin());
        permission.setCanCreate(request.canCreate());
    }
}
