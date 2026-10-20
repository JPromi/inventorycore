package com.jpromi.inventorycore.service;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.AssetStatusChangeResponse;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetStatus;
import com.jpromi.inventorycore.entity.AssetStatusChange;
import com.jpromi.inventorycore.entity.Inspection;
import com.jpromi.inventorycore.entity.InspectionItem;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AssetStatusCategory;
import com.jpromi.inventorycore.enums.AssetStatusKey;
import com.jpromi.inventorycore.enums.InspectionCondition;
import com.jpromi.inventorycore.repository.AssetStatusChangeRepository;
import com.jpromi.inventorycore.repository.AssetStatusRepository;

/**
 * Statuses of assets and their history. Every change is kept with comment, author and, when an
 * inspection set it, the protocol. The built-in statuses are created on start.
 */
@Service
public class AssetStatusService {

    /** Built-in statuses first (in their fixed order), then the custom ones by area and name. */
    public static final Comparator<AssetStatus> ORDER = Comparator
        .comparing((AssetStatus status) -> status.getSystemKey() == null ? Integer.MAX_VALUE : status.getSystemKey().ordinal())
        .thenComparing(status -> status.getArea() == null ? "" : status.getArea().getName(), String.CASE_INSENSITIVE_ORDER)
        .thenComparing(AssetStatus::getName, String.CASE_INSENSITIVE_ORDER);

    private final AssetStatusRepository statusRepository;
    private final AssetStatusChangeRepository changeRepository;
    private final ApiMapper mapper;

    public AssetStatusService(AssetStatusRepository statusRepository, AssetStatusChangeRepository changeRepository, ApiMapper mapper) {
        this.statusRepository = statusRepository;
        this.changeRepository = changeRepository;
        this.mapper = mapper;
    }

    /** Creates missing built-in statuses (on start; idempotent). */
    @Transactional
    public void ensureBuiltIns() {
        for (AssetStatusKey key : AssetStatusKey.values()) {
            if (statusRepository.findBySystemKey(key).isEmpty()) {
                statusRepository.save(AssetStatus.builder()
                    .systemKey(key)
                    .name(key.defaultName())
                    .color(key.color())
                    .category(key.category())
                    .build());
            }
        }
    }

    public AssetStatus builtIn(AssetStatusKey key) {
        return statusRepository.findBySystemKey(key)
            .orElseThrow(() -> new IllegalStateException("Built-in status " + key + " is missing"));
    }

    /** Built-in statuses and the custom ones of the areas the user has access to. */
    public static boolean isVisible(AccessContext access, AssetStatus status) {
        return status.getArea() == null || access.hasAccessTo(status.getArea());
    }

    public List<AssetStatus> visible(AccessContext access) {
        return statusRepository.findByDeletedFalse().stream()
            .filter(status -> isVisible(access, status))
            .sorted(ORDER)
            .toList();
    }

    /** A custom status can only be given to assets of its area. */
    public static boolean usableFor(AssetStatus status, Asset asset) {
        return !status.isDeleted() && (status.getArea() == null
            || asset.getAreas().stream().anyMatch(area -> area.getId().equals(status.getArea().getId())));
    }

    /** The requested status for the asset; "Vorhanden" when none was given. */
    public AssetStatus resolve(UUID statusUuid, Asset asset) {
        if (statusUuid == null) {
            return builtIn(AssetStatusKey.AVAILABLE);
        }
        AssetStatus status = statusRepository.findByUuid(statusUuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status nicht gefunden."));
        if (!usableFor(status, asset)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Der Status „" + status.getName() + "“ gehört zu einem anderen Bereich als das Asset.");
        }
        return status;
    }

    /**
     * Sets the status and writes the history entry; nothing happens when it does not change.
     * The asset must be saved (or managed) by the caller.
     */
    public boolean change(Asset asset, AssetStatus status, String comment, User user, Inspection inspection) {
        AssetStatus current = asset.getStatus();
        if (current == status || (current != null && current.getId() != null && current.getId().equals(status.getId()))) {
            return false;
        }
        OffsetDateTime now = OffsetDateTime.now();
        asset.setStatus(status);
        asset.setStatusChangedAt(now);
        changeRepository.save(AssetStatusChange.builder()
            .asset(asset)
            .fromStatus(current)
            .toStatus(status)
            .comment(comment == null || comment.isBlank() ? null : comment.trim())
            .changedAt(now)
            .changedByUuid(user == null ? null : user.getUuid())
            .changedByName(user == null ? null : displayName(user))
            .inspectionUuid(inspection == null ? null : inspection.getUuid())
            .inspectionTitle(inspection == null ? null : inspection.getTitle())
            .build());
        return true;
    }

    /** Sets the status that follows from the results of a completed inspection. */
    public void applyInspection(Inspection inspection, User user) {
        for (InspectionItem item : inspection.getItems()) {
            Asset asset = item.getAsset();
            if (asset == null || asset.isDeleted()) {
                continue;
            }
            AssetStatusKey target = statusAfter(item, asset.getStatus());
            if (target != null) {
                change(asset, builtIn(target), null, user, inspection);
            }
        }
    }

    /**
     * Status after an inspection result, or null to keep the current one.
     * A defect or failed check makes the asset "Defekt" (an asset already in a defect status, e.g.
     * "In Reparatur", keeps it). An expected asset that was not found becomes "Nicht auffindbar".
     * A passed check makes it "Vorhanden" again; an asset that was only found ends a "Nicht
     * auffindbar" or "In Lieferung", but not a defect, because nobody checked whether it works.
     * Retired assets are never changed automatically.
     */
    public static AssetStatusKey statusAfter(InspectionItem item, AssetStatus current) {
        AssetStatusCategory category = current == null ? AssetStatusCategory.ACTIVE : current.getCategory();
        if (category == AssetStatusCategory.RETIRED) {
            return null;
        }
        boolean defect = switch (item.getStatus()) {
            case FAILED -> true;
            case PRESENT -> item.getCondition() == InspectionCondition.DEFECT;
            default -> false;
        };
        if (defect) {
            return category == AssetStatusCategory.DEFECT ? null : AssetStatusKey.DEFECT;
        }
        return switch (item.getStatus()) {
            case MISSING -> item.isExpected() && category != AssetStatusCategory.MISSING ? AssetStatusKey.MISSING : null;
            case PASSED -> backToAvailable(current, true);
            case PRESENT -> backToAvailable(current, item.getCondition() == InspectionCondition.OK);
            default -> null;
        };
    }

    private static AssetStatusKey backToAvailable(AssetStatus current, boolean worksChecked) {
        if (current == null) {
            return AssetStatusKey.AVAILABLE;
        }
        boolean heals = current.getSystemKey() == AssetStatusKey.IN_DELIVERY
            || current.getCategory() == AssetStatusCategory.MISSING
            || (worksChecked && current.getCategory() == AssetStatusCategory.DEFECT);
        return heals ? AssetStatusKey.AVAILABLE : null;
    }

    @Transactional(readOnly = true)
    public List<AssetStatusChangeResponse> history(Asset asset) {
        return changeRepository.findByAssetOrderByChangedAtDescIdDesc(asset).stream()
            .map(change -> new AssetStatusChangeResponse(
                change.getUuid(),
                change.getFromStatus() == null ? null : mapper.toResponse(change.getFromStatus()),
                mapper.toResponse(change.getToStatus()),
                change.getComment(),
                change.getChangedAt(),
                change.getChangedByName(),
                change.getInspectionUuid(),
                change.getInspectionTitle()))
            .toList();
    }

    private static String displayName(User user) {
        return user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getUsername() : user.getDisplayName();
    }
}
