package com.jpromi.inventorycore.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.GeocodingResult;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.service.GeocodingService;
import com.jpromi.inventorycore.service.PermissionService;

/** Address ↔ coordinates for the location form (proxied to Nominatim). */
@RestController
public class GeocodingController {
    private final GeocodingService geocoding;
    private final PermissionService permissionService;

    public GeocodingController(GeocodingService geocoding, PermissionService permissionService) {
        this.geocoding = geocoding;
        this.permissionService = permissionService;
    }

    @GetMapping("/api/geocoding/search")
    public List<GeocodingResult> search(@RequestParam("q") String query, Authentication authentication) {
        requireLocationEditor(authentication);
        return geocoding.search(query);
    }

    @GetMapping("/api/geocoding/reverse")
    public GeocodingResult reverse(@RequestParam("lat") double latitude, @RequestParam("lon") double longitude, Authentication authentication) {
        requireLocationEditor(authentication);
        return geocoding.reverse(latitude, longitude)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No address found"));
    }

    /** Only needed while creating or editing locations; keeps the external service out of reach otherwise. */
    private void requireLocationEditor(Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        if (!access.canAnywhere(PermissionResourceType.LOCATION, PermissionAction.CREATE)
            && !access.canAnywhere(PermissionResourceType.LOCATION, PermissionAction.EDIT)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden");
        }
    }
}
