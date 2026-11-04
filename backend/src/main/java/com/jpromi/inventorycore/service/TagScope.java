package com.jpromi.inventorycore.service;

import java.util.Collection;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;

/** Shared tag scope rules for inventory assignments, pickers and configuration. */
public final class TagScope {
    private TagScope() {}

    public static java.util.stream.Stream<Tag> tagsOf(Asset asset) {
        return asset.effectiveTags();
    }

    public static boolean visible(AccessContext access, Tag tag) {
        return access.isAdmin() || (tag.getArea() != null && access.hasAccessTo(tag.getArea()));
    }

    public static boolean canCreate(AccessContext access, Area area) {
        return access.can(PermissionResourceType.ASSET_TYPE, PermissionAction.CREATE, Set.of(area))
            || access.can(PermissionResourceType.ASSET_TYPE, PermissionAction.EDIT, Set.of(area))
            || access.can(PermissionResourceType.ASSET, PermissionAction.CREATE, Set.of(area))
            || access.can(PermissionResourceType.ASSET, PermissionAction.EDIT, Set.of(area));
    }

    public static boolean matches(Tag tag, Collection<Area> areas) {
        return tag.belongsTo(areas);
    }

    public static Tag inAreas(Tag tag, Collection<Area> areas) {
        if (!matches(tag, areas)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Der Tag gehört zu einem anderen Bereich.");
        }
        return tag;
    }

    public static Tag assign(AccessContext access, Tag tag, Collection<Area> areas, Set<java.util.UUID> existing) {
        inAreas(tag, areas);
        if (!existing.contains(tag.getUuid()) && !visible(access, tag)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tag nicht gefunden.");
        }
        return tag;
    }
}
