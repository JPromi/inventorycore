package com.jpromi.inventorycore.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.InspectionDueResponse;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.AssetInspectionSchedule;
import com.jpromi.inventorycore.entity.InspectionType;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.InspectionCondition;
import com.jpromi.inventorycore.enums.InspectionItemStatus;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AssetInspectionScheduleRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.InspectionItemRepository;
import com.jpromi.inventorycore.repository.InspectionTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

/**
 * Due dates of recurring inspections. Nothing is stored per check: the last check is read from the
 * inspection items, so checking a device in any inspection of the type resets its timer right away.
 *
 * <p>Rules per asset and recurring inspection type (that applies to the asset's type):
 * <ul>
 *   <li>next due = last passed check + interval; never checked = due today</li>
 *   <li>a defect (FAILED) newer than the last pass makes it due on the day of the defect</li>
 *   <li>a fixed date set after the last check replaces the calculated date</li>
 * </ul>
 */
@Service
public class InspectionScheduleService {

    /** "Due" starts this many days before the due date. */
    public static final int DUE_SOON_DAYS = 7;

    private record Key(long assetId, long typeId) {}

    private record Check(OffsetDateTime at, String by, InspectionItemStatus status) {}

    private record LastChecks(Check lastPass, Check lastFail) {
        Check latest() {
            if (lastPass == null) {
                return lastFail;
            }
            if (lastFail == null) {
                return lastPass;
            }
            return lastFail.at().isAfter(lastPass.at()) ? lastFail : lastPass;
        }
    }

    private final InspectionTypeRepository typeRepository;
    private final AssetRepository assetRepository;
    private final InspectionItemRepository itemRepository;
    private final AssetInspectionScheduleRepository scheduleRepository;
    private final LocationRepository locationRepository;

    public InspectionScheduleService(
        InspectionTypeRepository typeRepository,
        AssetRepository assetRepository,
        InspectionItemRepository itemRepository,
        AssetInspectionScheduleRepository scheduleRepository,
        LocationRepository locationRepository
    ) {
        this.typeRepository = typeRepository;
        this.assetRepository = assetRepository;
        this.itemRepository = itemRepository;
        this.scheduleRepository = scheduleRepository;
        this.locationRepository = locationRepository;
    }

    /** All recurring inspections of all assets the user may see, most urgent first. */
    @Transactional(readOnly = true)
    public List<InspectionDueResponse> all(AccessContext access) {
        PermissionService.require(access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.INSPECT));
        List<Asset> assets = assetRepository.findByDeletedFalse().stream().filter(access::canViewAsset).toList();
        // only kinds of inspection the user may do (e.g. not those of other areas)
        Set<UUID> usable = typeRepository.findAll().stream()
            .filter(type -> InspectionService.canUse(access, type))
            .map(InspectionType::getUuid)
            .collect(java.util.stream.Collectors.toSet());
        return compute(assets).stream().filter(entry -> usable.contains(entry.inspectionTypeUuid())).toList();
    }

    @Transactional(readOnly = true)
    public List<InspectionDueResponse> ofAsset(AccessContext access, UUID assetUuid) {
        Asset asset = visibleAsset(access, assetUuid);
        return compute(List.of(asset));
    }

    /** Sets (or with {@code null} removes) a fixed date for the next inspection of one asset. */
    @Transactional
    public InspectionDueResponse setFixedDate(AccessContext access, User user, UUID assetUuid, UUID typeUuid, LocalDate date) {
        Asset asset = visibleAsset(access, assetUuid);
        if (!asset.isInspectionRequired()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dieses Asset ist von Prüfungen ausgenommen.");
        }
        PermissionService.require(access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, asset.getAreas())
            || access.can(PermissionResourceType.ASSET, PermissionAction.EDIT, asset.getAreas()));
        InspectionType type = typeRepository.findByUuid(typeUuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Prüfungsart nicht gefunden"));

        AssetInspectionSchedule schedule = scheduleRepository.findByAssetAndInspectionType(asset, type).orElse(null);
        if (date == null) {
            if (schedule != null) {
                scheduleRepository.delete(schedule);
            }
        } else {
            if (schedule == null) {
                schedule = AssetInspectionSchedule.builder().asset(asset).inspectionType(type).fixedDueDate(date).build();
            }
            schedule.setFixedDueDate(date);
            schedule.setSetAt(OffsetDateTime.now());
            schedule.setSetByName(user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getUsername() : user.getDisplayName());
            scheduleRepository.save(schedule);
        }
        scheduleRepository.flush();
        return compute(List.of(asset)).stream()
            .filter(entry -> entry.inspectionTypeUuid().equals(typeUuid))
            .findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diese Prüfungsart gilt nicht für dieses Asset."));
    }

    /** Ids of the assets for which the type is due within {@code withinDays} (overdue included). */
    @Transactional(readOnly = true)
    public Set<UUID> dueAssetUuids(List<Asset> assets, InspectionType type, int withinDays) {
        LocalDate limit = today().plusDays(Math.max(0, withinDays));
        Set<UUID> due = new HashSet<>();
        for (InspectionDueResponse entry : compute(assets)) {
            if (entry.inspectionTypeUuid().equals(type.getUuid()) && !entry.nextDueDate().isAfter(limit)) {
                due.add(entry.assetUuid());
            }
        }
        return due;
    }

    private List<InspectionDueResponse> compute(List<Asset> assets) {
        List<InspectionType> types = typeRepository.findAll().stream().filter(InspectionType::isRecurring).toList();
        if (types.isEmpty() || assets.isEmpty()) {
            return List.of();
        }
        Map<Key, LastChecks> checks = lastChecks();
        Map<Key, AssetInspectionSchedule> overrides = new HashMap<>();
        for (AssetInspectionSchedule schedule : scheduleRepository.findAll()) {
            overrides.put(new Key(schedule.getAsset().getId(), schedule.getInspectionType().getId()), schedule);
        }
        Map<Long, Location> locations = new HashMap<>();
        locationRepository.findAll().forEach(location -> locations.put(location.getId(), location));

        LocalDate today = today();
        List<InspectionDueResponse> result = new ArrayList<>();
        for (Asset asset : assets) {
            if (!asset.isInspectionRequired()) continue;
            for (InspectionType type : types) {
                if (type.appliesTo(asset)) {
                    Key key = new Key(asset.getId(), type.getId());
                    result.add(entry(asset, type, checks.get(key), overrides.get(key), locations, today));
                }
            }
        }
        result.sort(Comparator.comparing(InspectionDueResponse::nextDueDate).thenComparing(InspectionDueResponse::assetName, String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    private InspectionDueResponse entry(
        Asset asset,
        InspectionType type,
        LastChecks checks,
        AssetInspectionSchedule override,
        Map<Long, Location> locations,
        LocalDate today
    ) {
        Check lastPass = checks == null ? null : checks.lastPass();
        Check lastFail = checks == null ? null : checks.lastFail();
        Check latest = checks == null ? null : checks.latest();

        LocalDate due = lastPass == null ? today : type.getIntervalUnit().addTo(toDate(lastPass.at()), type.getIntervalValue());
        if (lastFail != null && (lastPass == null || lastFail.at().isAfter(lastPass.at()))) {
            // a defect must be checked again, independent of the interval
            due = due.isBefore(toDate(lastFail.at())) ? due : toDate(lastFail.at());
        }
        LocalDate fixed = null;
        if (override != null && (latest == null || override.getSetAt() == null || override.getSetAt().isAfter(latest.at()))) {
            fixed = override.getFixedDueDate();
            due = fixed;
        }

        long days = ChronoUnit.DAYS.between(today, due);
        String state = days < 0 ? "OVERDUE" : days <= DUE_SOON_DAYS ? "DUE" : "OK";
        return new InspectionDueResponse(
            asset.getUuid(),
            asset.getName(),
            asset.getInvId(),
            asset.getAssetType() == null ? null : asset.getAssetType().getName(),
            asset.getLocation() == null ? null : path(asset.getLocation(), locations),
            type.getUuid(),
            type.getName(),
            type.getColor(),
            type.getIntervalValue(),
            type.getIntervalUnit(),
            latest == null ? null : latest.at(),
            latest == null ? null : latest.by(),
            latest == null ? null : latest.status(),
            due,
            fixed,
            state,
            days,
            asset.getAreas().stream().map(area -> area.getUuid()).toList()
        );
    }

    private Map<Key, LastChecks> lastChecks() {
        Map<Key, LastChecks> result = new HashMap<>();
        for (Object[] row : itemRepository.findChecks()) {
            Key key = new Key((Long) row[0], (Long) row[1]);
            InspectionItemStatus status = (InspectionItemStatus) row[2];
            if (row.length > 5 && row[5] == InspectionCondition.DEFECT) {
                // present but broken: must be checked again like a failed single check
                status = InspectionItemStatus.FAILED;
            }
            Check check = new Check((OffsetDateTime) row[3], (String) row[4], status);
            LastChecks current = result.getOrDefault(key, new LastChecks(null, null));
            if (status == InspectionItemStatus.FAILED) {
                if (current.lastFail() == null || check.at().isAfter(current.lastFail().at())) {
                    current = new LastChecks(current.lastPass(), check);
                }
            } else if (current.lastPass() == null || check.at().isAfter(current.lastPass().at())) {
                current = new LastChecks(check, current.lastFail());
            }
            result.put(key, current);
        }
        return result;
    }

    private Asset visibleAsset(AccessContext access, UUID uuid) {
        Asset asset = assetRepository.findByUuid(uuid)
            .filter(entry -> !entry.isDeleted())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset nicht gefunden"));
        PermissionService.require(access.canViewAsset(asset));
        return asset;
    }

    private static String path(Location location, Map<Long, Location> locations) {
        List<String> names = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        Location current = location;
        while (current != null && seen.add(current.getId())) {
            names.add(0, current.getName());
            Location parent = current.getParentLocation();
            current = parent == null ? null : locations.getOrDefault(parent.getId(), parent);
        }
        return String.join(" / ", names);
    }

    private static LocalDate toDate(OffsetDateTime time) {
        return time.atZoneSameInstant(ZoneId.systemDefault()).toLocalDate();
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.systemDefault());
    }
}
