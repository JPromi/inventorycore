package com.jpromi.inventorycore.service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.jpromi.inventorycore.entity.Asset;
import com.jpromi.inventorycore.entity.Location;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

/**
 * Resolves a scanned barcode to assets or locations. Labels may encode a link to the asset, its
 * uuid, the inventory id or any other field (inventory number, serial number), so all of these
 * are tried. Objects the user may not see are treated as not found.
 *
 * <p>Used by the scan page and by inspections.
 */
@Service
public class ScanResolver {

    /** How the code was understood: LINK, UUID, CODE (inventory id / number / serial number) or NONE. */
    public record Resolution(String code, String matchedBy, List<Asset> assets, List<Location> locations) {
        public boolean found() {
            return !assets.isEmpty() || !locations.isEmpty();
        }
    }

    private static final Pattern LINK = Pattern.compile(
        "/(assets|locations)/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})");
    private static final Pattern UUID_ANYWHERE = Pattern.compile(
        "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    /** Control characters some scanners add (e.g. GS in GS1 codes, trailing CR/LF). */
    private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");

    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;

    public ScanResolver(AssetRepository assetRepository, LocationRepository locationRepository) {
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
    }

    public static String clean(String code) {
        return code == null ? "" : CONTROL.matcher(code).replaceAll("").trim();
    }

    public Resolution resolve(AccessContext access, String code) {
        String value = clean(code);
        if (value.isEmpty()) {
            return new Resolution(value, "NONE", List.of(), List.of());
        }
        for (String candidate : candidates(value)) {
            Resolution resolution = lookup(access, candidate);
            if (resolution.found()) {
                return resolution;
            }
        }
        return new Resolution(value, "NONE", List.of(), List.of());
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

    private Resolution lookup(AccessContext access, String value) {
        Matcher link = LINK.matcher(value);
        if (link.find()) {
            UUID uuid = UUID.fromString(link.group(2));
            return "assets".equals(link.group(1))
                ? resolution(value, "LINK", visibleAsset(access, uuid), Optional.empty())
                : resolution(value, "LINK", Optional.empty(), visibleLocation(access, uuid));
        }

        // a uuid anywhere in the code, also from links the scanner garbled (e.g. "httpsÖ--host-assets-...")
        Matcher uuidMatch = UUID_ANYWHERE.matcher(value);
        if (uuidMatch.find()) {
            UUID uuid = UUID.fromString(uuidMatch.group());
            Resolution byUuid = resolution(value, "UUID", visibleAsset(access, uuid), visibleLocation(access, uuid));
            if (byUuid.found()) {
                return byUuid;
            }
        }

        List<Asset> assets = assetRepository.findByScanCode(value).stream().filter(access::canViewAsset).toList();
        return new Resolution(value, assets.isEmpty() ? "NONE" : "CODE", assets, List.of());
    }

    private static Resolution resolution(String code, String matchedBy, Optional<Asset> asset, Optional<Location> location) {
        List<Asset> assets = asset.stream().toList();
        List<Location> locations = location.stream().toList();
        return new Resolution(code, assets.isEmpty() && locations.isEmpty() ? "NONE" : matchedBy, assets, locations);
    }

    private Optional<Asset> visibleAsset(AccessContext access, UUID uuid) {
        return assetRepository.findByUuid(uuid).filter(asset -> !asset.isDeleted() && access.canViewAsset(asset));
    }

    private Optional<Location> visibleLocation(AccessContext access, UUID uuid) {
        return locationRepository.findByUuid(uuid).filter(location -> !location.isDeleted() && access.canViewLocation(location));
    }
}
