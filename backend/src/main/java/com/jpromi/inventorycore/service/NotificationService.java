package com.jpromi.inventorycore.service;

import java.net.URI;
import java.security.Security;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.NotificationDtos.*;
import com.jpromi.inventorycore.entity.*;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.*;


@Service
@Transactional
public class NotificationService {
    private final NotificationPreferenceRepository preferences;
    private final NotificationMessageRepository messages;
    private final NotificationSettingsRepository settings;
    private final NotificationSubscriptionRepository subscriptions;
    private final InspectionScheduleService schedules;
    private final PermissionService permissions;
    private final AssetRepository assets;
    private final AppUserRepository users;
    private final InspectionTypeRepository types;
    private final AuditService audit;

    public NotificationService(NotificationPreferenceRepository preferences, NotificationMessageRepository messages,
        NotificationSettingsRepository settings, NotificationSubscriptionRepository subscriptions,
        InspectionScheduleService schedules, PermissionService permissions, AssetRepository assets,
        AppUserRepository users, InspectionTypeRepository types, AuditService audit) {
        this.preferences = preferences;
        this.messages = messages;
        this.settings = settings;
        this.subscriptions = subscriptions;
        this.schedules = schedules;
        this.permissions = permissions;
        this.assets = assets;
        this.users = users;
        this.types = types;
        this.audit = audit;
        Security.addProvider(new BouncyCastleProvider());
    }

    public NotificationSettings settings() {
        return settings.findById(1L).orElseGet(() -> {
            NotificationSettings value = new NotificationSettings();
            try {
                var generator = java.security.KeyPairGenerator.getInstance("ECDH", "BC");
                generator.initialize(new java.security.spec.ECGenParameterSpec("prime256v1"));
                var pair = generator.generateKeyPair();
                var encoder = Base64.getUrlEncoder().withoutPadding();
                value.setVapidPublicKey(encoder.encodeToString(
                    ((org.bouncycastle.jce.interfaces.ECPublicKey) pair.getPublic()).getQ().getEncoded(false)));
                value.setVapidPrivateKey(encoder.encodeToString(
                    org.bouncycastle.util.BigIntegers.asUnsignedByteArray(32,
                        ((org.bouncycastle.jce.interfaces.ECPrivateKey) pair.getPrivate()).getD())));
            } catch (Exception e) {
                throw new IllegalStateException("Cannot generate Web Push keys", e);
            }
            return settings.saveAndFlush(value);
        });
    }

    public NotificationPreference preference(User user) {
        return preferences.findById(user.getUuid()).orElseGet(() -> {
            var value = new NotificationPreference();
            value.setUserUuid(user.getUuid());
            value.setEmailAddress(user.getEmail());
            return value;
        });
    }

    public Preferences getPreferences(User user) {
        var p = preference(user);
        var s = settings();
        return new Preferences(p.isInbox(), p.isEmail(), p.isPush(), p.getDaysBefore(),
            p.getEmailAddress(), mailAvailable(s), s.getVapidPublicKey(),
            p.isOverdueInbox(), p.isOverdueEmail(), p.isOverduePush());
    }

    public Preferences savePreferences(User user, Preferences request) {
        require(request.daysBefore() >= 0 && request.daysBefore() <= 90);
        var p = preference(user);
        boolean available = mailAvailable(settings());
        require(!(request.email() || request.overdueEmail()) || available);
        if (request.email() || request.overdueEmail()) require(validEmail(request.emailAddress()));
        p.setInbox(request.inbox());
        p.setEmail(available && request.email());
        p.setPush(request.push());
        p.setOverdueInbox(request.overdueInbox());
        p.setOverdueEmail(available && request.overdueEmail());
        p.setOverduePush(request.overduePush());
        p.setDaysBefore(request.daysBefore());
        p.setEmailAddress(trim(request.emailAddress()));
        preferences.save(p);
        return getPreferences(user);
    }

    public MailSettings getMailSettings() {
        var s = settings();
        return new MailSettings(s.isEnabled(), s.getHost(), s.getPort(), s.getUsername(), null,
            s.getPassword() != null && !s.getPassword().isEmpty(), s.getFromAddress(), s.isStartTls());
    }

    public MailSettings saveMailSettings(MailSettings request) {
        require(request.port() > 0 && request.port() <= 65535);
        require(request.host() == null || request.host().length() <= 253);
        require(request.username() == null || request.username().length() <= 255);
        require(request.password() == null || request.password().length() <= 255);
        if (request.enabled()) {
            require(request.host() != null && request.host().matches("[a-zA-Z0-9.:-]+"));
            require(validEmail(request.fromAddress()));
        }
        var before = getMailSettings();
        var s = settings();
        s.setEnabled(request.enabled());
        s.setHost(trim(request.host()));
        s.setPort(request.port());
        s.setUsername(trim(request.username()));
        if (request.password() != null) s.setPassword(request.password());
        s.setFromAddress(trim(request.fromAddress()));
        s.setStartTls(request.startTls());
        settings.save(s);
        var after = getMailSettings();
        audit.logChanges(com.jpromi.inventorycore.enums.AuditObjectType.SETTINGS,
            null, "E-Mail-Versand", before, after);
        return after;
    }

    public static boolean mailAvailable(NotificationSettings s) {
        return s.isEnabled() && s.getHost() != null && !s.getHost().isBlank() && validEmail(s.getFromAddress());
    }

    private static boolean validEmail(String value) {
        return value != null && value.length() <= 254 && value.matches("[^\\s<>@]+@[^\\s<>@]+\\.[^\\s<>@]+");
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    private static void require(boolean valid) {
        if (!valid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ungültige Benachrichtigungseinstellungen.");
    }

    public void subscribe(User user, Subscription request) {
        require(request.endpoint() != null && request.endpoint().length() <= 2000 && request.keys() != null);
        try {
            URI uri = URI.create(request.endpoint());
            String host = uri.getHost();
            // Only known browser push providers: arbitrary URLs would permit server-side requests.
            require("https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getFragment() == null
                && (uri.getPort() == -1 || uri.getPort() == 443) && host != null
                && (Set.of("fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com").contains(host)
                    || host.endsWith(".notify.windows.com")));
            require(Base64.getUrlDecoder().decode(request.keys().p256dh()).length == 65);
            require(Base64.getUrlDecoder().decode(request.keys().auth()).length == 16);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ungültiges Push-Abonnement.");
        }
        var value = subscriptions.findByEndpoint(request.endpoint()).orElseGet(NotificationSubscription::new);
        // Browser subscriptions belong to the currently signed-in account on shared devices.
        value.setUserUuid(user.getUuid());
        value.setEndpoint(request.endpoint());
        value.setP256dh(request.keys().p256dh());
        value.setAuth(request.keys().auth());
        require(subscriptions.findByUserUuid(user.getUuid()).size() < 20
            || subscriptions.findByEndpoint(request.endpoint()).isPresent());
        subscriptions.save(value);
    }

    public void unsubscribe(User user, String endpoint) {
        subscriptions.findByEndpoint(endpoint).filter(s -> s.getUserUuid().equals(user.getUuid()))
            .ifPresent(subscriptions::delete);
    }

    public boolean visible(NotificationMessage message, AccessContext access) {
        return types.findByUuid(message.getInspectionTypeUuid()).filter(type -> InspectionService.canUse(access, type)).isPresent()
            && assets.findByUuid(message.getAssetUuid()).filter(a -> !a.isDeleted())
            .filter(access::canViewAsset)
            .filter(a -> access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, a.getAreas())).isPresent();
    }

    public List<Message> inbox(User user, AccessContext access) {
        return messages.findByUserUuidOrderByCreatedAtDesc(user.getUuid()).stream()
            .filter(m -> visible(m, access))
            .map(m -> new Message(m.getUuid(), m.getTitle(), m.getBody(), m.getAssetUuid(), m.getCreatedAt(), m.getReadAt()))
            .toList();
    }

    public void markRead(User user, UUID uuid, AccessContext access) {
        var message = messages.findLockedByUuid(uuid).filter(m -> m.getUserUuid().equals(user.getUuid()))
            .filter(m -> visible(m, access))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (message.getReadAt() == null) message.setReadAt(OffsetDateTime.now());
    }

    /** One reminder for each asset/type/check cycle, plus one escalation when it becomes overdue. */
    public void generate(UUID userUuid) {
        var user = users.findForNotificationsByUuid(userUuid).orElse(null);
        if (user == null) return;
        if (!user.isEnabled()) return;
        var p = preference(user);
        if (!p.isInbox() && !p.isEmail() && !p.isPush()
            && !p.isOverdueInbox() && !p.isOverdueEmail() && !p.isOverduePush()) return;
        var access = new AccessContext(user.isAdmin(), permissions.permissionsOf(user));
        if (!access.canAnywhere(PermissionResourceType.ASSET, PermissionAction.INSPECT)) return;
        for (var due : schedules.all(access)) {
            if (due.daysUntilDue() > p.getDaysBefore()) continue;
            if (assets.findByUuid(due.assetUuid())
                .filter(a -> access.can(PermissionResourceType.ASSET, PermissionAction.INSPECT, a.getAreas())).isEmpty()) continue;
            // Never-checked assets calculate "today" anew every day: use a stable cycle identifier.
            String cycle = due.lastCheckedAt() != null ? due.lastCheckedAt().toString() : "never";
            if (due.fixedDueDate() != null) cycle += "/" + due.fixedDueDate();
            String phase = due.nextDueDate().isBefore(LocalDate.now()) ? "overdue" : "due";
            boolean overdue = phase.equals("overdue");
            boolean inbox = overdue ? p.isOverdueInbox() : p.isInbox();
            boolean email = (overdue ? p.isOverdueEmail() : p.isEmail()) && mailAvailable(settings());
            boolean push = overdue ? p.isOverduePush() : p.isPush();
            if (!inbox && !email && !push) continue;
            String key = user.getUuid() + ":" + due.assetUuid() + ":" + due.inspectionTypeUuid() + ":" + cycle + ":" + phase;
            if (messages.existsByEventKey(key)) continue;
            var message = new NotificationMessage();
            message.setUserUuid(user.getUuid());
            message.setEventKey(key);
            message.setAssetUuid(due.assetUuid());
            message.setInspectionTypeUuid(due.inspectionTypeUuid());
            message.setTitle(phase.equals("overdue") ? "Prüfung überfällig" : "Prüfung demnächst fällig");
            String body = due.assetName() + ": " + due.inspectionTypeName() + " – fällig am "
                + due.nextDueDate().format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy")) + ".";
            message.setBody(body.substring(0, Math.min(body.length(), 2000)));
            message.setInbox(inbox);
            message.setOverdue(overdue);
            message.setEmailPending(email);
            message.setPushPending(push);
            messages.save(message);
        }
    }
}
