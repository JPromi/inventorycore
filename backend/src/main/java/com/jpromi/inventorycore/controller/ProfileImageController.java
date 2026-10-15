package com.jpromi.inventorycore.controller;

import java.io.IOException;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.UserResponse;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.service.ApiMapper;
import com.jpromi.inventorycore.service.ProfileImageService;

@RestController
@Transactional
public class ProfileImageController {
    private final AppUserRepository users;
    private final ApiMapper mapper;

    public ProfileImageController(AppUserRepository users, ApiMapper mapper) {
        this.users = users;
        this.mapper = mapper;
    }

    @PostMapping(value = "/api/auth/me/profile-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UserResponse upload(Authentication authentication, @RequestParam("file") MultipartFile file) throws IOException {
        User user = localUser(authentication);
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Keine Datei erhalten.");
        }
        ProfileImageService.setImage(user, file.getBytes());
        return mapper.toResponse(users.save(user));
    }

    @DeleteMapping("/api/auth/me/profile-image")
    public UserResponse delete(Authentication authentication) {
        User user = localUser(authentication);
        ProfileImageService.setImage(user, null);
        user.setProfileImageUrl(null);
        return mapper.toResponse(users.save(user));
    }

    @GetMapping("/api/profile-images/{uuid}")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> image(@PathVariable UUID uuid) {
        User user = users.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (user.getProfileImage() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .contentType(MediaType.parseMediaType(user.getProfileImageContentType()))
            .body(user.getProfileImage());
    }

    private User localUser(Authentication authentication) {
        if (authentication == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        User user = users.findByUsername(authentication.getName())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (user.getSourceProvider() != Provider.LOCAL) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Das Profilbild wird vom Anmeldeserver verwaltet.");
        }
        return user;
    }
}
