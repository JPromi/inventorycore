package com.jpromi.inventorycore.service;

import org.springframework.stereotype.Service;

import com.jpromi.inventorycore.dto.AuditDetail;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.repository.AppUserRepository;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Sign-ins, failed sign-ins and sign-outs in the activity log, as entries about the user (object
 * type USER), with the way of signing in, the IP address and the browser (user agent). Admins see
 * them on the user's page.
 */
@Service
public class LoginAuditService {

    /** How the user signed in. */
    public enum Method {
        LOCAL,
        LDAP,
        OIDC
    }

    private static final int MAX_USER_AGENT = 500;

    private final AuditService audit;
    private final AppUserRepository userRepository;

    public LoginAuditService(AuditService audit, AppUserRepository userRepository) {
        this.audit = audit;
        this.userRepository = userRepository;
    }

    public void signedIn(User user, Method method, HttpServletRequest request) {
        audit.logAs(user, AuditAction.LOGIN, AuditObjectType.USER, user.getUuid(), user.getUsername(),
            AuditDetail.event("SIGN_IN", "method", method.name(), "ip", ip(request), "userAgent", userAgent(request)));
    }

    /**
     * A failed attempt. The entry belongs to the account if one has this user name, so admins see
     * attempts on it; unknown names only appear in the activity log.
     */
    public void failed(String username, Method method, String reason, HttpServletRequest request) {
        // method null: the account decides (local password or directory)
        String name = username == null || username.isBlank() ? null : username.trim();
        User user = name == null ? null : userRepository.findByUsername(name).orElse(null);
        Method way = method != null ? method : user == null ? null : methodOf(user);
        audit.logAs(null, AuditAction.LOGIN_FAILED, AuditObjectType.USER, user == null ? null : user.getUuid(), name,
            AuditDetail.event("SIGN_IN_FAILED", "method", way == null ? null : way.name(), "reason", reason,
                "ip", ip(request), "userAgent", userAgent(request)));
    }

    public void signedOut(User user, HttpServletRequest request) {
        audit.logAs(user, AuditAction.LOGOUT, AuditObjectType.USER, user.getUuid(), user.getUsername(),
            AuditDetail.event("SIGN_OUT", "ip", ip(request), "userAgent", userAgent(request)));
    }

    /** Local accounts sign in with their password, imported ones against the directory. */
    public static Method methodOf(User user) {
        return user != null && user.getSourceProvider() == com.jpromi.inventorycore.enums.Provider.LDAP ? Method.LDAP : Method.LOCAL;
    }

    /**
     * Address of the client. Behind a reverse proxy the forwarded headers are applied by Spring
     * ({@code server.forward-headers-strategy}), so this is the real client, not the proxy.
     */
    private static String ip(HttpServletRequest request) {
        return request == null ? null : request.getRemoteAddr();
    }

    private static String userAgent(HttpServletRequest request) {
        String value = request == null ? null : request.getHeader("User-Agent");
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.length() > MAX_USER_AGENT ? value.substring(0, MAX_USER_AGENT) : value;
    }
}
