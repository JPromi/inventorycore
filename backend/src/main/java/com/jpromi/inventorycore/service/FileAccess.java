package com.jpromi.inventorycore.service;

import java.util.Collection;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.StoredFileRepository;

/**
 * Who may read, upload and attach stored files. A file is readable for whoever may see one of the
 * objects it belongs to (asset, location, type, or the protocol of an inspection photo), for its
 * uploader and for admins. Files are attached only when freshly uploaded or already part of the same object.
 */
@Service
public class FileAccess {
    private final StoredFileRepository files;

    public FileAccess(StoredFileRepository files) {
        this.files = files;
    }

    @Transactional(readOnly = true)
    public boolean canRead(AccessContext access, User user, StoredFile file) {
        if (access.isAdmin() || (user != null && user.getUuid().equals(file.getUploadedByUuid()))) {
            return true;
        }
        return files.assetsUsing(file).stream().anyMatch(access::canViewAsset)
            || files.locationsUsing(file).stream().anyMatch(access::canViewLocation)
            || files.assetTypesUsing(file).stream().anyMatch(access::canViewAssetType)
            || files.inspectionItemsUsing(file).stream().anyMatch(item -> InspectionService.canSeePhoto(access, item));
    }

    /** Uploading is part of creating, editing or inspecting something. */
    public static boolean canUpload(AccessContext access) {
        for (PermissionResourceType type : new PermissionResourceType[] { PermissionResourceType.ASSET, PermissionResourceType.LOCATION, PermissionResourceType.ASSET_TYPE }) {
            if (access.canAnywhere(type, PermissionAction.CREATE) || access.canAnywhere(type, PermissionAction.EDIT)) {
                return true;
            }
        }
        return access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.INSPECT);
    }

    /**
     * A file for an image or photo: it must be unused (just uploaded) or already belong to the
     * object being saved ({@code attachedHere}); files of other objects cannot be taken over.
     */
    @Transactional(readOnly = true)
    public StoredFile attachable(UUID uuid, Collection<UUID> attachedHere) {
        StoredFile file = files.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unbekannte Datei: " + uuid));
        boolean attachedElsewhere = !files.assetsUsing(file).isEmpty() || !files.locationsUsing(file).isEmpty()
            || !files.assetTypesUsing(file).isEmpty() || !files.inspectionItemsUsing(file).isEmpty();
        if (!attachedHere.contains(uuid) && attachedElsewhere) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Die Datei gehört bereits zu einem anderen Eintrag.");
        }
        return file;
    }
}
