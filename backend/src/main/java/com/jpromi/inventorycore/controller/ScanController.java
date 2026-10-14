package com.jpromi.inventorycore.controller;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.jpromi.inventorycore.dto.AssetResponse;
import com.jpromi.inventorycore.dto.LocationResponse;
import com.jpromi.inventorycore.dto.ScanResult;
import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.LocationRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.PermissionService;

/**
 * Resolves a scanned barcode. Labels may encode a link to the asset, its uuid, the inventory id
 * or any other field (inventory number, serial number), so all of these are tried.
 * Objects the user may not see are treated as not found.
 */
@RestController
@RequestMapping("/api/scan")
public class ScanController {

    private static final Pattern LINK = Pattern.compile(
        "/(assets|locations)/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})");
    private static final Pattern UUID_ANYWHERE = Pattern.compile(
        "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    /** Control characters some scanners add (e.g. GS in GS1 codes, trailing CR/LF). */
    private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");

    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;
    private final PermissionService permissionService;
    private final ApiMapper mapper;

    public ScanController(AssetRepository assetRepository, LocationRepository locationRepository, PermissionService permissionService, ApiMapper mapper) {
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
        this.permissionService = permissionService;
        this.mapper = mapper;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ScanResult scan(@RequestParam String code, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        String value = CONTROL.matcher(code).replaceAll("").trim();
        if (value.isEmpty()) {
            return new ScanResult(value, "NONE", List.of(), List.of());
        }
        for (String candidate : candidates(value)) {
            ScanResult result = lookup(access, candidate);
            if (!"NONE".equals(result.matchedBy())) {
                return result;
            }
        }
        return new ScanResult(value, "NONE", List.of(), List.of());
    }

    /**
     * The code as scanned, then with the typical mistakes of a hardware scanner that types with a
     * US layout on a German keyboard: "-" arrives as "ß" (INV-2026-... becomes INVß2026ß...) and
     * y/z are swapped.
     */
    private static Set<String> candidates(String value) {
        Set<String> candidates = new LinkedHashSet<>();
        candidates.add(value);
        String dashes = value.replace('ß', '-');
        candidates.add(dashes);
        candidates.add(swapYz(dashes));
        return candidates;
    }

    private static String swapYz(String value) {
        StringBuilder swapped = new StringBuilder(value.length());
        for (char c : value.toCharArray()) {
            swapped.append(switch (c) {
                case 'y' -> 'z';
                case 'z' -> 'y';
                case 'Y' -> 'Z';
                case 'Z' -> 'Y';
                default -> c;
            });
        }
        return swapped.toString();
    }

    private ScanResult lookup(AccessContext access, String value) {
        Matcher link = LINK.matcher(value);
        if (link.find()) {
            UUID uuid = UUID.fromString(link.group(2));
            return "assets".equals(link.group(1))
                ? result(value, "LINK", visibleAsset(access, uuid), Optional.empty())
                : result(value, "LINK", Optional.empty(), visibleLocation(access, uuid));
        }

        // a uuid anywhere in the code, also from links the scanner garbled (e.g. "httpsÖ--host-assets-...")
        Matcher uuidMatch = UUID_ANYWHERE.matcher(value);
        if (uuidMatch.find()) {
            UUID uuid = UUID.fromString(uuidMatch.group());
            ScanResult byUuid = result(value, "UUID", visibleAsset(access, uuid), visibleLocation(access, uuid));
            if (!"NONE".equals(byUuid.matchedBy())) {
                return byUuid;
            }
        }

        List<AssetResponse> assets = assetRepository.findByScanCode(value).stream()
            .filter(access::canViewAsset)
            .map(mapper::toResponse)
            .toList();
        return new ScanResult(value, assets.isEmpty() ? "NONE" : "CODE", assets, List.of());
    }

    private ScanResult result(String code, String matchedBy, Optional<Asset> asset, Optional<Location> location) {
        List<AssetResponse> assets = asset.map(mapper::toResponse).stream().toList();
        List<LocationResponse> locations = location.map(mapper::toResponse).stream().toList();
        return new ScanResult(code, assets.isEmpty() && locations.isEmpty() ? "NONE" : matchedBy, assets, locations);
    }

    private Optional<Asset> visibleAsset(AccessContext access, UUID uuid) {
        return assetRepository.findByUuid(uuid).filter(asset -> !asset.isDeleted() && access.canViewAsset(asset));
    }

    private Optional<Location> visibleLocation(AccessContext access, UUID uuid) {
        return locationRepository.findByUuid(uuid).filter(location -> !location.isDeleted() && access.canViewLocation(location));
    }
}
