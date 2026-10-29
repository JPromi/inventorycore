package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.dto.InspectionDueResponse;
import com.jpromi.inventorycore.dto.NotificationDtos.*;
import com.jpromi.inventorycore.entity.*;
import com.jpromi.inventorycore.repository.*;

class NotificationServiceTest {
    final NotificationPreferenceRepository preferences = mock(NotificationPreferenceRepository.class);
    final NotificationMessageRepository messages = mock(NotificationMessageRepository.class);
    final NotificationSettingsRepository settings = mock(NotificationSettingsRepository.class);
    final NotificationSubscriptionRepository subscriptions = mock(NotificationSubscriptionRepository.class);
    final InspectionScheduleService schedules = mock(InspectionScheduleService.class);
    final PermissionService permissions = mock(PermissionService.class);
    final AssetRepository assets = mock(AssetRepository.class);
    final AppUserRepository users = mock(AppUserRepository.class);
    final InspectionTypeRepository types = mock(InspectionTypeRepository.class);
    final AuditService audit = mock(AuditService.class);
    final NotificationService service = new NotificationService(preferences, messages, settings,
        subscriptions, schedules, permissions, assets, users, types, audit);
    final User user = User.builder().username("operator").displayName("Operator").role("ADMIN").build();
    final Asset asset = Asset.builder().name("HLF 20").build();
    final InspectionType type = InspectionType.builder().name("Jahresprüfung").build();
    final NotificationSettings config = new NotificationSettings();
    final NotificationPreference preference = new NotificationPreference();

    @BeforeEach
    void setup() {
        preference.setUserUuid(user.getUuid());
        when(settings.findById(1L)).thenReturn(Optional.of(config));
        when(settings.save(any())).thenAnswer(c -> c.getArgument(0));
        when(preferences.findById(user.getUuid())).thenReturn(Optional.of(preference));
        when(users.findForNotificationsByUuid(user.getUuid())).thenReturn(Optional.of(user));
        when(permissions.permissionsOf(user)).thenReturn(List.of());
        when(assets.findByUuid(asset.getUuid())).thenReturn(Optional.of(asset));
        when(types.findByUuid(type.getUuid())).thenReturn(Optional.of(type));
    }

    @Test
    void emailCannotBeEnabledWithoutAdminConfiguration() {
        assertFalse(service.getPreferences(user).emailAvailable());
        assertThrows(ResponseStatusException.class, () -> service.savePreferences(user,
            new Preferences(true, true, false, 7, "operator@example.org", true, "ignored", true, false, false)));
        verify(preferences, never()).save(any());
        assertThrows(ResponseStatusException.class, () -> service.savePreferences(user,
            new Preferences(true, false, false, 7, "operator@example.org", true, "ignored", true, true, false)));
    }

    @Test
    void validatesLeadTimeAndRecipientAndPreservesChannelChoices() {
        config.setEnabled(true);
        config.setHost("smtp.example.org");
        config.setFromAddress("inventory@example.org");
        assertThrows(ResponseStatusException.class, () -> service.savePreferences(user,
            new Preferences(true, false, false, -1, null, false, null, true, false, false)));
        assertThrows(ResponseStatusException.class, () -> service.savePreferences(user,
            new Preferences(true, true, false, 7, "bad\r\naddress", false, null, true, false, false)));
        var result = service.savePreferences(user,
            new Preferences(false, true, false, 14, "operator@example.org", false, null, true, false, true));
        assertTrue(result.emailAvailable());
        assertTrue(result.email());
        assertFalse(result.overdueEmail());
        assertTrue(result.overduePush());
        assertEquals(14, result.daysBefore());
    }

    @Test
    void smtpPasswordIsNeverReturnedAndNullPreservesIt() {
        config.setPassword("test-only-password");
        var saved = service.saveMailSettings(new MailSettings(true, "smtp.example.org", 587,
            "sender", null, false, "sender@example.org", true));
        assertNull(saved.password());
        assertTrue(saved.passwordConfigured());
        assertEquals("test-only-password", config.getPassword());
        service.saveMailSettings(new MailSettings(false, null, 587, null, "", false, null, true));
        assertFalse(service.getMailSettings().passwordConfigured());
        assertFalse(service.getPreferences(user).emailAvailable());
    }

    @Test
    void createsPersistentCompatibleVapidKeys() throws Exception {
        when(settings.findById(1L)).thenReturn(Optional.empty());
        when(settings.saveAndFlush(any())).thenAnswer(c -> c.getArgument(0));
        var keys = service.settings();
        assertEquals(65, Base64.getUrlDecoder().decode(keys.getVapidPublicKey()).length);
        assertEquals(32, Base64.getUrlDecoder().decode(keys.getVapidPrivateKey()).length);
        assertTrue(nl.martijndwars.webpush.Utils.verifyKeyPair(
            nl.martijndwars.webpush.Utils.loadPrivateKey(keys.getVapidPrivateKey()),
            nl.martijndwars.webpush.Utils.loadPublicKey(keys.getVapidPublicKey())));
        new nl.martijndwars.webpush.PushService(keys.getVapidPublicKey(), keys.getVapidPrivateKey(), "https://example.org");
        verify(settings).saveAndFlush(any());
    }

    @Test
    void rejectsArbitraryPushUrlsAndMalformedKeys() {
        for (String endpoint : List.of("https://127.0.0.1/private", "http://fcm.googleapis.com/a",
            "https://fcm.googleapis.com.attacker.example/a", "https://user@fcm.googleapis.com/a")) {
            assertThrows(ResponseStatusException.class, () -> service.subscribe(user,
                new Subscription(endpoint, new Subscription.Keys("bad", "bad"))));
        }
        verify(subscriptions, never()).save(any());
    }

    @Test
    void generatesOncePerCheckCycleAndSeparatelyForOverdue() {
        var keys = new HashSet<String>();
        when(messages.existsByEventKey(any())).thenAnswer(c -> keys.contains(c.getArgument(0)));
        when(messages.save(any())).thenAnswer(c -> {
            NotificationMessage value = c.getArgument(0);
            keys.add(value.getEventKey());
            return value;
        });
        var checked = OffsetDateTime.now().minusMonths(1);
        when(schedules.all(any())).thenReturn(List.of(due(LocalDate.now().plusDays(3), checked)));
        service.generate(user.getUuid());
        service.generate(user.getUuid());
        assertEquals(1, keys.size());
        when(schedules.all(any())).thenReturn(List.of(due(LocalDate.now().minusDays(1), checked)));
        service.generate(user.getUuid());
        assertEquals(2, keys.size());
        when(schedules.all(any())).thenReturn(List.of(due(LocalDate.now().plusDays(2), checked.plusDays(1))));
        service.generate(user.getUuid());
        assertEquals(3, keys.size());
    }

    @Test
    void neverCheckedCycleDoesNotGenerateDailyDuplicates() {
        when(schedules.all(any())).thenReturn(List.of(due(LocalDate.now(), null)));
        service.generate(user.getUuid());
        var captor = ArgumentCaptor.forClass(NotificationMessage.class);
        verify(messages).save(captor.capture());
        assertTrue(captor.getValue().getEventKey().endsWith(":never:due"));
        assertFalse(captor.getValue().isEmailPending());
    }

    @Test
    void disabledUsersAndDistantDueDatesProduceNothing() {
        user.setEnabled(false);
        service.generate(user.getUuid());
        verifyNoInteractions(schedules);
        user.setEnabled(true);
        when(schedules.all(any())).thenReturn(List.of(due(LocalDate.now().plusDays(40), null)));
        service.generate(user.getUuid());
        verify(messages, never()).save(any());
    }

    @Test
    void onlyOwnersCanReadAndRevokedAccessHidesMessages() {
        var message = new NotificationMessage();
        message.setUserUuid(user.getUuid());
        message.setAssetUuid(asset.getUuid());
        message.setInspectionTypeUuid(type.getUuid());
        when(messages.findLockedByUuid(message.getUuid())).thenReturn(Optional.of(message));
        when(messages.findByUserUuidOrderByCreatedAtDesc(user.getUuid())).thenReturn(List.of(message));
        var admin = new AccessContext(true, List.of());
        assertEquals(1, service.inbox(user, admin).size());
        var stranger = User.builder().username("other").build();
        assertThrows(ResponseStatusException.class, () -> service.markRead(stranger, message.getUuid(), admin));
        assertNull(message.getReadAt());
        service.markRead(user, message.getUuid(), admin);
        assertNotNull(message.getReadAt());
        var revoked = new AccessContext(false, List.of());
        assertTrue(service.inbox(user, revoked).isEmpty());
        assertThrows(ResponseStatusException.class, () -> service.markRead(user, message.getUuid(), revoked));
    }

    @Test
    void channelSelectionDiffersForUpcomingAndOverdueReminders() {
        preference.setInbox(false);
        preference.setOverduePush(true);
        when(schedules.all(any())).thenReturn(List.of(due(LocalDate.now().plusDays(1), null)));
        service.generate(user.getUuid());
        verify(messages, never()).save(any());
        when(schedules.all(any())).thenReturn(List.of(due(LocalDate.now().minusDays(1), null)));
        service.generate(user.getUuid());
        var captor = ArgumentCaptor.forClass(NotificationMessage.class);
        verify(messages).save(captor.capture());
        assertTrue(captor.getValue().isPushPending());
        assertTrue(captor.getValue().isOverdue());
    }

    private InspectionDueResponse due(LocalDate date, OffsetDateTime checked) {
        return new InspectionDueResponse(asset.getUuid(), asset.getName(), null, null, null,
            type.getUuid(), type.getName(), null, null, null, checked, null, null, date, null,
            "DUE", java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), date), List.of());
    }
}
