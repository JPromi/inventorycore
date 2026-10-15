package com.jpromi.inventorycore.service;

import java.util.HashSet;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.repository.AssetRepository;

@Service
public class AssetHierarchyService {
    private final AssetRepository assets;

    public AssetHierarchyService(AssetRepository assets) {
        this.assets = assets;
    }

    public void assign(AccessContext access, Asset child, UUID parentUuid, String note) {
        Asset parent = parentUuid == null ? null : assets.findByUuid(parentUuid)
            .filter(asset -> !asset.isDeleted())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Übergeordnetes Asset nicht gefunden."));
        if (parent != null && (child.getParentAsset() == null
            || !Objects.equals(child.getParentAsset().getUuid(), parentUuid))) {
            PermissionService.require(access.canViewAsset(parent));
        }
        var visited = new HashSet<UUID>();
        for (Asset ancestor = parent; ancestor != null; ancestor = ancestor.getParentAsset()) {
            if (Objects.equals(ancestor.getUuid(), child.getUuid()) || !visited.add(ancestor.getUuid())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Die Zuordnung würde einen Kreis in der Asset-Hierarchie erzeugen.");
            }
        }
        String text = note == null || note.isBlank() || parent == null ? null : note.trim();
        if (text != null && text.length() > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Die Verknüpfungsbeschreibung darf maximal 1000 Zeichen enthalten.");
        }
        child.setParentAsset(parent);
        child.setParentAssetNote(text);
    }

    public void requireNoChildren(Asset asset) {
        if (assets.existsByParentAssetAndDeletedFalse(asset)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Das Asset hat noch untergeordnete Assets. Bitte zuerst deren Zuordnung ändern.");
        }
    }
}
