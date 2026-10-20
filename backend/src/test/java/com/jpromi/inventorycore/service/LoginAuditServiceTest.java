package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;

import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.repository.AppUserRepository;

class LoginAuditServiceTest {

    private final AuditService audit = mock(AuditService.class);
    private final AppUserRepository users = mock(AppUserRepository.class);
    private final LoginAuditService service = new LoginAuditService(audit, users);

    private static MockHttpServletRequest request(String userAgent) {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.7");
        if (userAgent != null) {
            request.addHeader("User-Agent", userAgent);
        }
        return request;
    }

    private AuditDetail logged(AuditAction action, User actor, java.util.UUID objectUuid, String objectName) {
        ArgumentCaptor<AuditDetail> detail = ArgumentCaptor.forClass(AuditDetail.class);
        verify(audit).logAs(eq(actor), eq(action), eq(AuditObjectType.USER), eq(objectUuid), eq(objectName), detail.capture());
        return detail.getValue();
    }

    @Test
    void signInsKeepWayIpAndBrowser() {
        User user = User.builder().username("inv").displayName("Admin").build();
        service.signedIn(user, LoginAuditService.Method.OIDC, request("Mozilla/5.0 (iPhone) Safari"));

        AuditDetail detail = logged(AuditAction.LOGIN, user, user.getUuid(), "inv");
        assertEquals("SIGN_IN", detail.code());
        assertEquals(Map.of("method", "OIDC", "ip", "203.0.113.7", "userAgent", "Mozilla/5.0 (iPhone) Safari"), detail.params());
    }

    @Test
    void failedAttemptsBelongToTheAccountWithThatName() {
        User user = User.builder().username("inv").sourceProvider(com.jpromi.inventorycore.enums.Provider.LOCAL).build();
        when(users.findByUsername("inv")).thenReturn(Optional.of(user));

        service.failed(" inv ", null, "BAD_CREDENTIALS", request(null));

        AuditDetail detail = logged(AuditAction.LOGIN_FAILED, null, user.getUuid(), "inv");
        assertEquals("SIGN_IN_FAILED", detail.code());
        assertEquals(Map.of("method", "LOCAL", "reason", "BAD_CREDENTIALS", "ip", "203.0.113.7"), detail.params());
    }

    @Test
    void attemptsOnUnknownNamesStayWithoutAccount() {
        when(users.findByUsername(any())).thenReturn(Optional.empty());
        service.failed("unbekannt", null, "BAD_CREDENTIALS", request("x".repeat(800)));

        AuditDetail detail = logged(AuditAction.LOGIN_FAILED, null, null, "unbekannt");
        assertNull(detail.params().get("method"));
        assertEquals(500, ((String) detail.params().get("userAgent")).length());
    }

    @Test
    void signOutsAreLoggedForTheUser() {
        User user = User.builder().username("inv").build();
        service.signedOut(user, request("curl/8"));
        assertEquals("SIGN_OUT", logged(AuditAction.LOGOUT, user, user.getUuid(), "inv").code());
    }
}
