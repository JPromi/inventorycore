package com.jpromi.inventorycore.service;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.HashSet;

import org.springframework.stereotype.Service;

import com.jpromi.inventorycore.dto.AreaResponse;
import com.jpromi.inventorycore.dto.AssetFieldDefinitionResponse;
import com.jpromi.inventorycore.dto.AssetFieldValueResponse;
import com.jpromi.inventorycore.dto.AssetImageResponse;
import com.jpromi.inventorycore.dto.FileResponse;
import com.jpromi.inventorycore.dto.AssetResponse;
import com.jpromi.inventorycore.dto.AssetTypeResponse;
import com.jpromi.inventorycore.dto.GroupPermissionResponse;
import com.jpromi.inventorycore.dto.GroupResponse;
import com.jpromi.inventorycore.dto.LocationImageResponse;
import com.jpromi.inventorycore.dto.LocationResponse;
import com.jpromi.inventorycore.dto.TagResponse;
import com.jpromi.inventorycore.dto.UserResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetFieldDefinition;
import com.jpromi.inventorycore.entity.AssetFieldValue;
import com.jpromi.inventorycore.entity.AssetImage;
import com.jpromi.inventorycore.entity.AssetType;
import com.jpromi.inventorycore.entity.AssetTypeImage;
import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.LocationImage;
import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.Tag;
import com.jpromi.inventorycore.entity.User;

@Service
public class ApiMapper {

    public UserResponse toResponse(User user) {
        return new UserResponse(
            user.getUuid(),
            user.getUsername(),
            user.getDisplayName(),
            user.getEmail(),
            user.getRole(),
            user.isEnabled(),
            user.getGroups().stream().map(Group::getUuid).collect(Collectors.toSet()),
            user.getSourceProvider()
        );
    }

    public GroupResponse toResponse(Group group) {
        return new GroupResponse(
            group.getUuid(),
            group.getName(),
            group.getSourceProvider(),
            group.getPermissions().stream().map(this::toResponse).collect(Collectors.toSet()),
            group.isAdminGroup()
        );
    }

    public GroupPermissionResponse toResponse(GroupPermission permission) {
        return new GroupPermissionResponse(
            permission.getUuid(),
            permission.getResourceType(),
            permission.getArea() == null ? null : permission.getArea().getUuid(),
            permission.isCanView(),
            permission.isCanEdit(),
            permission.isCanInspect(),
            permission.isCanDelete(),
            permission.isAdmin(),
            permission.isCanCreate()
        );
    }

    public AreaResponse toResponse(Area area, Long assetCount, Long locationCount, Long assetTypeCount) {
        return new AreaResponse(
            area.getUuid(),
            area.getName(),
            area.getDescription(),
            area.getColor(),
            area.isDefaultArea(),
            assetCount,
            locationCount,
            assetTypeCount
        );
    }

    public TagResponse toResponse(Tag tag) {
        return new TagResponse(tag.getUuid(), tag.getName(), tag.getColor());
    }

    public AssetTypeResponse toResponse(AssetType type) {
        return new AssetTypeResponse(
            type.getUuid(),
            type.getName(),
            type.getDescription(),
            type.getInspectionIntervalDays(),
            type.getCreatedAt(),
            type.getDeletedAt(),
            type.isDeleted(),
            type.getFieldDefinitions().stream().map(this::toResponse).toList(),
            type.getImages().stream().map(this::toResponse).toList(),
            type.getTags().stream().map(this::toResponse).toList(),
            type.getAreas().stream().map(Area::getUuid).toList()
        );
    }

    public AssetFieldDefinitionResponse toResponse(AssetFieldDefinition definition) {
        return new AssetFieldDefinitionResponse(
            definition.getUuid(),
            definition.getName(),
            definition.getFieldKey(),
            definition.getFieldType(),
            definition.getOptionsJson(),
            definition.isRequired(),
            definition.isTypeField(),
            definition.getSortOrder()
        );
    }

    public LocationResponse toResponse(Location location) {
        return new LocationResponse(
            location.getUuid(),
            location.getName(),
            location.getDescription(),
            location.getAddress(),
            location.getParentLocation() == null ? null : location.getParentLocation().getUuid(),
            location.getChildLocations().stream().map(Location::getUuid).toList(),
            location.getAssets().stream().map(Asset::getUuid).toList(),
            location.getImages().stream().map(this::toResponse).toList(),
            location.getCreatedAt(),
            location.getDeletedAt(),
            location.isDeleted(),
            location.getAreas().stream().map(Area::getUuid).toList()
        );
    }

    public LocationImageResponse toResponse(LocationImage image) {
        StoredFile file = image.getFile();
        return new LocationImageResponse(image.getUuid(), image.getKind(), file == null ? null : file.getUuid(), imageUrl(file, image.getUrl(), false),
            imageUrl(file, image.getUrl(), true), image.getFileName(), image.getContentType(), image.getSortOrder(), image.getUploadedAt());
    }

    public AssetResponse toResponse(Asset asset) {
        Set<TagResponse> tags = new HashSet<>(asset.getTags().stream().map(this::toResponse).collect(Collectors.toSet()));
        if (asset.getAssetType() != null) {
            tags.addAll(asset.getAssetType().getTags().stream().map(this::toResponse).collect(Collectors.toSet()));
        }

        return new AssetResponse(
            asset.getUuid(),
            asset.getInvId(),
            asset.getName(),
            asset.getDescription(),
            asset.getSerialNumber(),
            asset.getInventoryNumber(),
            asset.getInspectionIntervalDays(),
            asset.getAssetType() == null ? null : asset.getAssetType().getUuid(),
            asset.getLocation() == null ? null : asset.getLocation().getUuid(),
            tags,
            asset.getFieldValues().stream().map(this::toResponse).toList(),
            asset.getImages().stream().map(this::toResponse).toList(),
            asset.getCreatedAt(),
            asset.getDeletedAt(),
            asset.isDeleted(),
            asset.getAreas().stream().map(Area::getUuid).collect(Collectors.toSet())
        );
    }

    public AssetFieldValueResponse toResponse(AssetFieldValue value) {
        return new AssetFieldValueResponse(
            value.getUuid(),
            value.getFieldDefinition() == null ? null : value.getFieldDefinition().getUuid(),
            value.getFieldKey(),
            value.getName(),
            value.getValue(),
            value.isCustomAssetField()
        );
    }

    public AssetImageResponse toResponse(AssetImage image) {
        StoredFile file = image.getFile();
        return new AssetImageResponse(image.getUuid(), image.getKind(), file == null ? null : file.getUuid(), imageUrl(file, image.getUrl(), false),
            imageUrl(file, image.getUrl(), true), image.getFileName(), image.getContentType(), image.getSortOrder(), image.getUploadedAt());
    }

    public AssetImageResponse toResponse(AssetTypeImage image) {
        StoredFile file = image.getFile();
        return new AssetImageResponse(image.getUuid(), image.getKind(), file == null ? null : file.getUuid(), imageUrl(file, image.getUrl(), false),
            imageUrl(file, image.getUrl(), true), image.getFileName(), image.getContentType(), image.getSortOrder(), image.getUploadedAt());
    }

    public FileResponse toResponse(StoredFile file) {
        return new FileResponse(file.getUuid(), fileUrl(file, false), fileUrl(file, true), file.getOriginalName(), file.getContentType(),
            file.getSize(), file.getOriginalSize(), file.getWidth(), file.getHeight(), file.getUploadedAt(), file.getUploadedByUuid(), file.getUploadedByName());
    }

    /** Uploaded files are served by the file endpoint; external images keep their url. */
    private static String imageUrl(StoredFile file, String externalUrl, boolean thumbnail) {
        return file == null ? externalUrl : fileUrl(file, thumbnail);
    }

    private static String fileUrl(StoredFile file, boolean thumbnail) {
        return "/api/files/" + file.getUuid() + (thumbnail && file.isHasThumbnail() ? "?variant=thumb" : "");
    }
}
