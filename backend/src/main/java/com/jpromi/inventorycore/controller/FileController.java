package com.jpromi.inventorycore.controller;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.FileResponse;
import com.jpromi.inventorycore.entity.StoredFile;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.files.FileStorageService;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.StoredFileRepository;
import com.jpromi.inventorycore.service.ApiMapper;

/**
 * Upload and delivery of files. The frontend references files by uuid and loads them through
 * {@code GET /api/files/{uuid}} (or {@code ?variant=thumb} for the preview), never as base64.
 */
@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileStorageService storage;
    private final StoredFileRepository repository;
    private final AppUserRepository userRepository;
    private final ApiMapper mapper;

    public FileController(FileStorageService storage, StoredFileRepository repository, AppUserRepository userRepository, ApiMapper mapper) {
        this.storage = storage;
        this.repository = repository;
        this.userRepository = userRepository;
        this.mapper = mapper;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public FileResponse upload(@RequestParam("file") MultipartFile file, Authentication authentication) {
        User uploader = authentication == null ? null : userRepository.findByUsername(authentication.getName()).orElse(null);
        return mapper.toResponse(storage.storeImage(file, uploader));
    }

    @GetMapping("/{uuid}/info")
    public FileResponse info(@PathVariable UUID uuid) {
        return mapper.toResponse(find(uuid));
    }

    @GetMapping("/{uuid}")
    public ResponseEntity<Resource> content(@PathVariable UUID uuid, @RequestParam(required = false) String variant) {
        StoredFile file = find(uuid);
        Path path = storage.path(file, "thumb".equals(variant));
        if (!Files.isReadable(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Datei fehlt im Speicher");
        }
        ContentDisposition disposition = ContentDisposition.inline()
            .filename(file.getOriginalName() == null ? file.getUuid().toString() : file.getOriginalName(), java.nio.charset.StandardCharsets.UTF_8)
            .build();
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(file.getContentType()))
            // the content behind a uuid never changes, so the browser may keep it
            .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable())
            .eTag(file.getUuid() + ("thumb".equals(variant) ? "-thumb" : ""))
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
            .header("X-Content-Type-Options", "nosniff")
            .body(new FileSystemResource(path));
    }

    /** Sends the reason as JSON, so the upload dialog can show it (Spring hides messages by default). */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handle(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode())
            .body(Map.of("message", exception.getReason() == null ? "" : exception.getReason()));
    }

    private StoredFile find(UUID uuid) {
        return repository.findByUuid(uuid).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Datei nicht gefunden"));
    }
}
