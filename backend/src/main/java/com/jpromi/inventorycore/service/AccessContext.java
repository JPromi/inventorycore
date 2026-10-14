package com.jpromi.inventorycore.service;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;

/**
 * Permissions of the current user for one request.
 *
 * <p>Rules:
 * <ul>
 *   <li>A permission applies to one area, or to all areas when its area is {@code null}.</li>
 *   <li>A permission applies to one kind of object, or to all kinds when its resource type is {@code null}.</li>
 *   <li>An object is accessible when the action is allowed in at least one of its areas.</li>
 *   <li>Viewing is inherited: whoever may view a location also sees its sub-locations and all assets in them.</li>
 *   <li>Users with the ADMIN role may do everything.</li>
 * </ul>
 */
public class AccessContext {

    private final boolean admin;
    private final List<GroupPermission> permissions;
    private final Map<Long, Boolean> locationViewCache = new HashMap<>();

    public AccessContext(boolean admin, List<GroupPermission> permissions) {
        this.admin = admin;
        this.permissions = permissions;
    }

    public boolean isAdmin() {
        return admin;
    }

    /** Allowed in at least one of the given areas. */
    public boolean can(PermissionResourceType type, PermissionAction action, Collection<Area> areas) {
        if (admin) {
            return true;
        }
        return permissions.stream()
            .filter(permission -> appliesTo(permission, type) && allows(permission, action))
            .anyMatch(permission -> permission.getArea() == null || areas.stream().anyMatch(area -> sameArea(area, permission.getArea())));
    }

    /** Allowed in every one of the given areas (e.g. when assigning an object to areas). */
    public boolean canInAll(PermissionResourceType type, PermissionAction action, Collection<Area> areas) {
        return areas.stream().allMatch(area -> can(type, action, Set.of(area)));
    }

    /** Allowed in any area at all. */
    public boolean canAnywhere(PermissionResourceType type, PermissionAction action) {
        return admin || permissions.stream().anyMatch(permission -> appliesTo(permission, type) && allows(permission, action));
    }

    /** Allowed for all areas at once (a permission without area), e.g. for things that apply everywhere. */
    public boolean canEverywhere(PermissionResourceType type, PermissionAction action) {
        return admin || permissions.stream()
            .anyMatch(permission -> permission.getArea() == null && appliesTo(permission, type) && allows(permission, action));
    }

    /** True when the user has at least one permission (of any kind) for this area or for all areas. */
    public boolean hasAccessTo(Area area) {
        return admin || permissions.stream().anyMatch(permission -> permission.getArea() == null || sameArea(area, permission.getArea()));
    }

    public boolean canViewLocation(Location location) {
        if (admin) {
            return true;
        }
        Boolean cached = locationViewCache.get(location.getId());
        if (cached != null) {
            return cached;
        }
        // guards against cycles in the location tree
        locationViewCache.put(location.getId(), false);
        // a visible parent makes all of its children visible
        boolean visible = can(PermissionResourceType.LOCATION, PermissionAction.VIEW, location.getAreas())
            || (location.getParentLocation() != null && canViewLocation(location.getParentLocation()));
        locationViewCache.put(location.getId(), visible);
        return visible;
    }

    public boolean canViewAsset(Asset asset) {
        return can(PermissionResourceType.ASSET, PermissionAction.VIEW, asset.getAreas())
            || (asset.getLocation() != null && canViewLocation(asset.getLocation()));
    }

    public boolean canViewAssetType(AssetType type) {
        return can(PermissionResourceType.ASSET_TYPE, PermissionAction.VIEW, type.getAreas());
    }

    private static boolean appliesTo(GroupPermission permission, PermissionResourceType type) {
        return permission.getResourceType() == null || permission.getResourceType() == type;
    }

    private boolean allows(GroupPermission permission, PermissionAction action) {
        if (permission.isAdmin()) {
            return true;
        }
        return switch (action) {
            case VIEW -> permission.isCanView();
            case CREATE -> permission.isCanCreate();
            case EDIT -> permission.isCanEdit();
            case DELETE -> permission.isCanDelete();
            case INSPECT -> permission.isCanInspect();
        };
    }

    private static boolean sameArea(Area a, Area b) {
        return a.getId() != null && a.getId().equals(b.getId());
    }
}
