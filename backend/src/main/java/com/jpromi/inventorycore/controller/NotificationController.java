package com.jpromi.inventorycore.controller;

import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import com.jpromi.inventorycore.dto.NotificationDtos.*;
import com.jpromi.inventorycore.service.NotificationService;
import com.jpromi.inventorycore.service.PermissionService;

@RestController
public class NotificationController {
    private final NotificationService service;
    private final PermissionService permissions;

    public NotificationController(NotificationService service, PermissionService permissions) {
        this.service = service;
        this.permissions = permissions;
    }

    @GetMapping("/api/notifications")
    public List<Message> inbox(Authentication auth) {
        return service.inbox(permissions.currentUser(auth), permissions.context(auth));
    }

    @PutMapping("/api/notifications/{uuid}/read")
    public void read(Authentication auth, @PathVariable UUID uuid) {
        service.markRead(permissions.currentUser(auth), uuid, permissions.context(auth));
    }

    @GetMapping("/api/notifications/preferences")
    public Preferences preferences(Authentication auth) {
        return service.getPreferences(permissions.currentUser(auth));
    }

    @PutMapping("/api/notifications/preferences")
    public Preferences save(Authentication auth, @RequestBody Preferences request) {
        return service.savePreferences(permissions.currentUser(auth), request);
    }

    @PostMapping("/api/notifications/subscriptions")
    public void subscribe(Authentication auth, @RequestBody Subscription request) {
        service.subscribe(permissions.currentUser(auth), request);
    }

    @DeleteMapping("/api/notifications/subscriptions")
    public void unsubscribe(Authentication auth, @RequestBody Subscription request) {
        service.unsubscribe(permissions.currentUser(auth), request.endpoint());
    }

    @GetMapping("/api/admin/notifications")
    public MailSettings settings() {
        return service.getMailSettings();
    }

    @PutMapping("/api/admin/notifications")
    public MailSettings settings(@RequestBody MailSettings request) {
        return service.saveMailSettings(request);
    }
}
