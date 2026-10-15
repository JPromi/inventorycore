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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.dto.AreaRequest;
import com.jpromi.inventorycore.dto.AreaResponse;
import com.jpromi.inventorycore.dto.GroupPermissionRequest;
import com.jpromi.inventorycore.dto.GroupPermissionResponse;
import com.jpromi.inventorycore.dto.GroupRequest;
import com.jpromi.inventorycore.dto.GroupResponse;
import com.jpromi.inventorycore.dto.GroupRowResponse;
import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.service.Paging;
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
import com.jpromi.inventorycore.repository.InspectionRepository;
import com.jpromi.inventorycore.repository.InspectionTypeRepository;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.service.AuditService;

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
    private final AuditService audit;
    private final InspectionRepository inspectionRepository;
    private final InspectionTypeRepository inspectionTypeRepository;

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
        ApiMapper mapper,
        AuditService audit,
        InspectionRepository inspectionRepository,
        InspectionTypeRepository inspectionTypeRepository
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
        this.audit = audit;
        this.inspectionRepository = inspectionRepository;
        this.inspectionTypeRepository = inspectionTypeRepository;
    }

    // ---- areas ----

    @GetMapping("/areas")
    public List<AreaResponse> areas() {
        return areaRepository.findAll().stream()
            .sorted(Comparator.comparing(Area::isDefaultArea).reversed().thenComparing(Area::getName, String.CASE_INSENSITIVE_ORDER))
            .map(this::toAreaResponse)
            .toList();
    }

    @GetMapping("/areas/page")
    public PageResponse<AreaResponse> areaPage(
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size
    ) {
        List<String> terms = Paging.terms(q);
        List<Area> matches = areaRepository.findAll().stream()
            .filter(area -> Paging.matches(terms, area.getName(), area.getDescription()))
            .sorted(Comparator.comparing(Area::isDefaultArea).reversed().thenComparing(Area::getName, String.CASE_INSENSITIVE_ORDER))
            .toList();
        return Paging.page(matches, page, size, this::toAreaResponse);
    }

    @PostMapping("/areas")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public AreaResponse createArea(@RequestBody AreaRequest request) {
        Area area = Area.builder().build();
        applyArea(area, request);
        AreaResponse created = toAreaResponse(areaRepository.save(area));
        audit.log(AuditAction.CREATE, AuditObjectType.AREA, created.uuid(), created.name());
        return created;
    }

    @PatchMapping("/areas/{uuid}")
    @Transactional
    public AreaResponse updateArea(@PathVariable UUID uuid, @RequestBody AreaRequest request) {
        Area area = area(uuid);
        if (area.isDefaultArea() && !request.defaultArea()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte stattdessen einen anderen Bereich als Standardbereich festlegen.");
        }
        AreaResponse before = toAreaResponse(area);
        applyArea(area, request);
        AreaResponse after = toAreaResponse(areaRepository.save(area));
        audit.logChanges(AuditObjectType.AREA, after.uuid(), after.name(), before, after);
        return after;
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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Der Standardbereich kann nicht gelöscht werden.");
        }
        Area defaultArea = areaRepository.findFirstByDefaultAreaTrue()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Es ist kein Standardbereich festgelegt."));

        assetRepository.findByArea(area).forEach(asset -> moveOut(asset.getAreas(), area, defaultArea));
        locationRepository.findByArea(area).forEach(location -> moveOut(location.getAreas(), area, defaultArea));
        assetTypeRepository.findByArea(area).forEach(type -> moveOut(type.getAreas(), area, defaultArea));
        labelTemplateRepository.findByArea(area).forEach(template -> {
            template.setArea(defaultArea);
            template.setDefaultForArea(false);
        });
        permissionRepository.findByArea(area).forEach(permission -> permission.getGroup().getPermissions().remove(permission));
        permissionRepository.flush();
        inspectionRepository.moveArea(area, defaultArea);
        inspectionTypeRepository.moveProtocolArea(area, defaultArea);
        areaRepository.delete(area);
        audit.log(AuditAction.DELETE, AuditObjectType.AREA, area.getUuid(), area.getName(),
            AuditDetail.event("OBJECTS_MOVED_TO_DEFAULT_AREA", "defaultArea", defaultArea.getName()));
    }

    @GetMapping("/users")
    public List<UserResponse> users() {
        return userRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    /** `status`: enabled, disabled or admin. */
    @GetMapping("/users/page")
    public PageResponse<UserResponse> userPage(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) UUID group,
        @RequestParam(required = false) String status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size
    ) {
        List<String> terms = Paging.terms(q);
        List<User> matches = userRepository.findAll().stream()
            .filter(user -> Paging.matches(terms, user.getUsername(), user.getDisplayName(), user.getEmail()))
            .filter(user -> group == null || user.getGroups().stream().anyMatch(entry -> entry.getUuid().equals(group)))
            .filter(user -> status == null || status.isBlank() || switch (status) {
                case "enabled" -> user.isEnabled();
                case "disabled" -> !user.isEnabled();
                case "admin" -> user.isAdmin();
                default -> true;
            })
            // like the list before: by display name, otherwise by user name
            .sorted(Comparator.comparing((User user) -> user.getDisplayName() == null || user.getDisplayName().isBlank()
                ? user.getUsername() : user.getDisplayName(), String.CASE_INSENSITIVE_ORDER))
            .toList();
        return Paging.page(matches, page, size, mapper::toResponse);
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
        UserResponse created = mapper.toResponse(userRepository.save(user));
        audit.log(AuditAction.CREATE, AuditObjectType.USER, created.uuid(), created.username());
        return created;
    }

    @PatchMapping("/users/{uuid}")
    public UserResponse updateUser(@PathVariable UUID uuid, @RequestBody UserRequest request) {
        User user = user(uuid);
        UserResponse before = mapper.toResponse(user);
        user.setUsername(request.username());
        user.setDisplayName(request.displayName());
        user.setEmail(request.email());
        user.setRole(request.role() == null ? user.getRole() : request.role());
        user.setEnabled(request.enabled());
        if (request.password() != null && !request.password().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.password()));
        }
        user.setGroups(resolveGroups(request));
        UserResponse after = mapper.toResponse(userRepository.save(user));
        List<AuditDetail> changes = new java.util.ArrayList<>(audit.diff(before, after));
        if (request.password() != null && !request.password().isBlank()) {
            changes.add(AuditDetail.event("PASSWORD_CHANGED"));
        }
        if (!changes.isEmpty()) {
            audit.log(AuditAction.UPDATE, AuditObjectType.USER, after.uuid(), after.username(), changes);
        }
        return after;
    }

    @DeleteMapping("/users/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable UUID uuid, Authentication authentication) {
        User user = user(uuid);
        if (authentication != null && user.getUsername().equals(authentication.getName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Der eigene Benutzer kann nicht gelöscht werden.");
        }
        userRepository.delete(user);
        audit.log(AuditAction.DELETE, AuditObjectType.USER, user.getUuid(), user.getUsername());
    }

    @GetMapping("/groups")
    public List<GroupResponse> groups() {
        return groupRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    /** Groups with member count and the first members; the search also finds groups by member. */
    @GetMapping("/groups/page")
    public PageResponse<GroupRowResponse> groupPage(
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size
    ) {
        List<String> terms = Paging.terms(q);
        List<User> users = userRepository.findAll().stream().sorted(Comparator.comparing(User::getUsername, String.CASE_INSENSITIVE_ORDER)).toList();
        java.util.function.Function<Group, List<User>> members = group -> users.stream()
            .filter(user -> user.getGroups().stream().anyMatch(entry -> entry.getId().equals(group.getId()))).toList();
        List<Group> matches = groupRepository.findAll().stream()
            .filter(group -> Paging.matches(terms, java.util.stream.Stream.concat(java.util.stream.Stream.of(group.getName()),
                members.apply(group).stream().flatMap(user -> java.util.stream.Stream.of(user.getUsername(), user.getDisplayName()))).toList()))
            .sorted(Comparator.comparing(Group::getName, String.CASE_INSENSITIVE_ORDER))
            .toList();
        return Paging.page(matches, page, size, group -> {
            GroupResponse response = mapper.toResponse(group);
            List<User> groupMembers = members.apply(group);
            return new GroupRowResponse(response.uuid(), response.name(), response.sourceProvider(), response.permissions(), response.adminGroup(),
                groupMembers.size(), groupMembers.stream().limit(5).map(mapper::toResponse).toList());
        });
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
        GroupResponse created = mapper.toResponse(groupRepository.save(group));
        audit.log(AuditAction.CREATE, AuditObjectType.GROUP, created.uuid(), created.name());
        return created;
    }

    @PatchMapping("/groups/{uuid}")
    @Transactional
    public GroupResponse updateGroup(@PathVariable UUID uuid, @RequestBody GroupRequest request) {
        Group group = group(uuid);
        GroupResponse before = mapper.toResponse(group);
        // names of LDAP / OIDC groups are managed by the provider
        if (group.getSourceProvider() == Provider.LOCAL) {
            group.setName(request.name());
        }
        group.setAdminGroup(request.adminGroup());
        group.getPermissions().clear();
        // delete old permissions before inserting new ones, otherwise the unique constraint fails
        groupRepository.flush();
        applyPermissions(group, request);
        GroupResponse after = mapper.toResponse(groupRepository.save(group));
        audit.logChanges(AuditObjectType.GROUP, after.uuid(), after.name(), before, after);
        return after;
    }

    @DeleteMapping("/groups/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteGroup(@PathVariable UUID uuid) {
        Group group = group(uuid);
        group.getUsers().forEach(user -> user.getGroups().remove(group));
        group.getUsers().clear();
        groupRepository.delete(group);
        audit.log(AuditAction.DELETE, AuditObjectType.GROUP, group.getUuid(), group.getName());
    }

    @PostMapping("/groups/{groupUuid}/permissions")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupPermissionResponse createPermission(@PathVariable UUID groupUuid, @RequestBody GroupPermissionRequest request) {
        Group group = group(groupUuid);
        GroupPermission permission = permission(group, request);
        group.getPermissions().add(permission);
        groupRepository.save(group);
        GroupPermissionResponse created = mapper.toResponse(permission);
        audit.log(AuditAction.CREATE, AuditObjectType.PERMISSION, group.getUuid(), group.getName(),
            AuditDetail.listChange("permissions", List.of(audit.permission(created)), List.of()));
        return created;
    }

    @PatchMapping("/permissions/{uuid}")
    public GroupPermissionResponse updatePermission(@PathVariable UUID uuid, @RequestBody GroupPermissionRequest request) {
        GroupPermission permission = permissionRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Permission not found"));
        GroupPermissionResponse before = mapper.toResponse(permission);
        applyPermission(permission, request);
        GroupPermissionResponse after = mapper.toResponse(permissionRepository.save(permission));
        if (!before.equals(after)) {
            audit.log(AuditAction.UPDATE, AuditObjectType.PERMISSION, permission.getGroup().getUuid(), permission.getGroup().getName(),
                AuditDetail.change("permissions", audit.permission(before), audit.permission(after)));
        }
        return after;
    }

    @DeleteMapping("/permissions/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePermission(@PathVariable UUID uuid) {
        GroupPermission permission = permissionRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Permission not found"));
        AuditDetail.Permission removed = audit.permission(mapper.toResponse(permission));
        permissionRepository.delete(permission);
        audit.log(AuditAction.DELETE, AuditObjectType.PERMISSION, permission.getGroup().getUuid(), permission.getGroup().getName(),
            AuditDetail.listChange("permissions", List.of(), List.of(removed)));
    }

    private void applyArea(Area area, AreaRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte einen Namen angeben.");
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
