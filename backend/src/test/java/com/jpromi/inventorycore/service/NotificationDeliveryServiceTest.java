package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.jpromi.inventorycore.entity.*;
import com.jpromi.inventorycore.repository.*;

class NotificationDeliveryServiceTest {
    final NotificationMessageRepository messages = mock(NotificationMessageRepository.class);
    final NotificationSubscriptionRepository subscriptions = mock(NotificationSubscriptionRepository.class);
    final AppUserRepository users = mock(AppUserRepository.class);
    final NotificationService service = mock(NotificationService.class);
    final PermissionService permissions = mock(PermissionService.class);
    final NotificationTransport transport = mock(NotificationTransport.class);
    final NotificationDeliveryService delivery = new NotificationDeliveryService(messages, subscriptions,
        users, service, permissions, transport);
    final NotificationMessage message = new NotificationMessage();
    final User user = User.builder().username("operator").role("ADMIN").build();
    final NotificationPreference preference = new NotificationPreference();
    final NotificationSettings config = new NotificationSettings();
    final NotificationSubscription subscription = new NotificationSubscription();

    @BeforeEach
    void setup() {
        message.setUserUuid(user.getUuid());
        message.setEmailPending(true);
        message.setPushPending(true);
        preference.setEmail(true);
        preference.setPush(true);
        preference.setEmailAddress("operator@example.org");
        config.setEnabled(true);
        config.setHost("smtp.example.org");
        config.setFromAddress("inventory@example.org");
        when(messages.findLockedByUuid(message.getUuid())).thenReturn(Optional.of(message));
        when(users.findByUuid(user.getUuid())).thenReturn(Optional.of(user));
        when(service.visible(eq(message), any())).thenReturn(true);
        when(service.preference(user)).thenReturn(preference);
        when(service.settings()).thenReturn(config);
        when(permissions.permissionsOf(user)).thenReturn(List.of());
        when(subscriptions.findByUserUuid(user.getUuid())).thenReturn(List.of(subscription));
    }

    @Test
    void successIsPersistedAndNotSentAgain() throws Exception {
        when(transport.sendPush(config, subscription)).thenReturn(201);
        delivery.deliver(message.getUuid());
        assertFalse(message.isEmailPending());
        assertFalse(message.isPushPending());
        delivery.deliver(message.getUuid());
        verify(transport, times(1)).sendMail(eq(config), eq("operator@example.org"), any(), any());
        verify(transport, times(1)).sendPush(config, subscription);
    }

    @Test
    void temporaryFailuresRetryAtMostFiveTimes() throws Exception {
        doThrow(new IllegalStateException("test failure")).when(transport).sendMail(any(), any(), any(), any());
        when(transport.sendPush(config, subscription)).thenReturn(503);
        for (int i = 0; i < 4; i++) {
            delivery.deliver(message.getUuid());
            assertTrue(message.isEmailPending());
            assertTrue(message.isPushPending());
        }
        delivery.deliver(message.getUuid());
        assertFalse(message.isEmailPending());
        assertFalse(message.isPushPending());
        assertEquals(5, message.getAttempts());
    }

    @Test
    void expiredSubscriptionsAreRemoved() throws Exception {
        when(transport.sendPush(config, subscription)).thenReturn(410);
        delivery.deliver(message.getUuid());
        verify(subscriptions).delete(subscription);
        assertFalse(message.isPushPending());
    }

    @Test
    void revokedAccessCancelsQueuedDelivery() {
        when(service.visible(eq(message), any())).thenReturn(false);
        delivery.deliver(message.getUuid());
        verifyNoInteractions(transport);
        assertFalse(message.isEmailPending());
        assertFalse(message.isPushPending());
    }

    @Test
    void disabledAccountAndDisabledChannelsCancelQueuedDelivery() {
        user.setEnabled(false);
        delivery.deliver(message.getUuid());
        verifyNoInteractions(transport);
        user.setEnabled(true);
        message.setEmailPending(true);
        message.setPushPending(true);
        message.setOverdue(true);
        // Upcoming preferences do not authorize overdue deliveries.
        delivery.deliver(message.getUuid());
        verifyNoInteractions(transport);
        assertFalse(message.isEmailPending());
        assertFalse(message.isPushPending());
    }
}
