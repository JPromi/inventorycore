package com.jpromi.inventorycore.controller;

import static com.jpromi.inventorycore.service.PermissionService.require;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
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

import com.jpromi.inventorycore.dto.AssetResponse;
import com.jpromi.inventorycore.dto.AssetStatusChangeRequest;
import com.jpromi.inventorycore.dto.AssetStatusChangeResponse;
import com.jpromi.inventorycore.dto.AssetStatusRequest;
import com.jpromi.inventorycore.dto.AssetStatusResponse;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetStatus;
import com.jpromi.inventorycore.enums.AssetStatusCategory;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetStatusRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.AssetStatusService;
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.service.PermissionService;

/**
 * Statuses of assets: the built-in ones plus custom ones per area, maintained by whoever may
 * maintain the configuration (types) of that area, like label templates. Changing the status of
 * an asset needs the right to edit or to inspect it.
 */
@RestController
@RequestMapping("/api")
public class AssetStatusController {

    private static final PermissionResourceType CONFIG = PermissionResourceType.ASSET_TYPE;

    private final AssetStatusRepository statusRepository;
    private final AssetRepository assetRepository;
    private final AreaRepository areaRepository;
    private final AssetStatusService statuses;
    private final PermissionService permissionService;
    private final ApiMapper mapper;
    private final AuditService audit;

    public AssetStatusController(
        AssetStatusRepository statusRepository,
        AssetRepository assetRepository,
        AreaRepository areaRepository,
        AssetStatusService statuses,
        PermissionService permissionService,
        ApiMapper mapper,
        AuditService audit
    ) {
        this.statusRepository = statusRepository;
        this.assetRepository = assetRepository;
        this.areaRepository = areaRepository;
        this.statuses = statuses;
        this.permissionService = permissionService;
        this.mapper = mapper;
        this.audit = audit;
    }

    // ---- configuration ----

    @GetMapping("/asset-statuses")
    public List<AssetStatusResponse> list(Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        return statuses.visible(access).stream().map(mapper::toResponse).toList();
    }

    @PostMapping("/asset-statuses")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public AssetStatusResponse create(@RequestBody AssetStatusRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Area area = areaOr400(request.areaUuid());
        require(access, CONFIG, PermissionAction.CREATE, Set.of(area));
        AssetStatus status = AssetStatus.builder().area(area).build();
        apply(status, request);
        AssetStatusResponse created = mapper.toResponse(statusRepository.save(status));
        audit.log(AuditAction.CREATE, AuditObjectType.ASSET_STATUS, created.uuid(), created.name());
        return created;
    }

    @PatchMapping("/asset-statuses/{uuid}")
    @Transactional
    public AssetStatusResponse update(@PathVariable UUID uuid, @RequestBody AssetStatusRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        AssetStatus status = customStatus(access, uuid);
        require(access, CONFIG, PermissionAction.EDIT, Set.of(status.getArea()));
        AssetStatusResponse before = mapper.toResponse(status);
        Area area = areaOr400(request.areaUuid());
        if (!area.getId().equals(status.getArea().getId())) {
            // assets with this status belong to the old area; they would get a status they cannot have
            if (statusRepository.countAssetsWith(status) > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Der Status wird noch verwendet; der Bereich kann deshalb nicht geändert werden.");
            }
            require(access, CONFIG, PermissionAction.EDIT, Set.of(area));
            status.setArea(area);
        }
        apply(status, request);
        AssetStatusResponse after = mapper.toResponse(statusRepository.save(status));
        audit.logChanges(AuditObjectType.ASSET_STATUS, after.uuid(), after.name(), before, after);
        return after;
    }

    /** Deleted statuses stay in the history; one still in use cannot be deleted. */
    @DeleteMapping("/asset-statuses/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        AssetStatus status = customStatus(access, uuid);
        require(access, CONFIG, PermissionAction.DELETE, Set.of(status.getArea()));
        long used = statusRepository.countAssetsWith(status);
        if (used > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, used == 1
                ? "Ein Asset hat noch diesen Status. Bitte zuerst einen anderen Status setzen."
                : used + " Assets haben noch diesen Status. Bitte zuerst einen anderen Status setzen.");
        }
        status.setDeleted(true);
        statusRepository.save(status);
        audit.log(AuditAction.DELETE, AuditObjectType.ASSET_STATUS, status.getUuid(), status.getName());
    }

    // ---- status of an asset ----

    @GetMapping("/assets/{uuid}/status-history")
    public List<AssetStatusChangeResponse> history(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Asset asset = visibleAsset(access, uuid);
        return statuses.history(asset);
    }

    @PostMapping("/assets/{uuid}/status")
    @Transactional
    public AssetResponse change(@PathVariable UUID uuid, @RequestBody AssetStatusChangeRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Asset asset = visibleAsset(access, uuid);
        require(access.can(PermissionResourceType.ASSET, PermissionAction.EDIT, asset.getAreas())
            || access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, asset.getAreas()));
        if (request.statusUuid() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte einen Status wählen.");
        }
        AssetResponse before = mapper.toResponse(asset);
        statuses.change(asset, statuses.resolve(request.statusUuid(), asset), request.comment(),
            permissionService.currentUser(authentication), null);
        AssetResponse after = mapper.toResponse(assetRepository.save(asset));
        audit.logChanges(AuditObjectType.ASSET, after.uuid(), after.name(), before, after);
        return after;
    }

    // ---- helpers ----

    private void apply(AssetStatus status, AssetStatusRequest request) {
        String name = request.name() == null ? "" : request.name().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte einen Namen angeben.");
        }
        // the same name twice would make the filter and the history ambiguous
        boolean taken = statusRepository.findByDeletedFalse().stream()
            .filter(other -> !other.getId().equals(status.getId()))
            .filter(other -> other.getArea() == null || other.getArea().getId().equals(status.getArea().getId()))
            .anyMatch(other -> other.getName().equalsIgnoreCase(name));
        if (taken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ein Status mit diesem Namen ist bereits vorhanden.");
        }
        status.setName(name);
        status.setColor(request.color());
        status.setCategory(request.category() == null ? AssetStatusCategory.ACTIVE : request.category());
    }

    /** Built-in statuses cannot be changed; hidden ones are reported as missing. */
    private AssetStatus customStatus(AccessContext access, UUID uuid) {
        AssetStatus status = statusRepository.findByUuid(uuid)
            .filter(entry -> !entry.isDeleted() && AssetStatusService.isVisible(access, entry))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Status nicht gefunden."));
        if (status.isBuiltIn()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Feste Status können nicht geändert werden.");
        }
        return status;
    }

    private Asset visibleAsset(AccessContext access, UUID uuid) {
        return assetRepository.findByUuid(uuid)
            .filter(asset -> !asset.isDeleted() && access.canViewAsset(asset))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Eintrag nicht gefunden."));
    }

    private Area areaOr400(UUID uuid) {
        if (uuid == null) {
            return areaRepository.findFirstByDefaultAreaTrue()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Es ist kein Standardbereich festgelegt."));
        }
        return areaRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bereich nicht gefunden."));
    }
}
