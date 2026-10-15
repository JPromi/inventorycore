package com.jpromi.inventorycore.ldap;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Hashtable;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import javax.naming.AuthenticationException;
import javax.naming.CommunicationException;
import javax.naming.Context;
import javax.naming.NamingEnumeration;
import javax.naming.NameNotFoundException;
import javax.naming.NamingException;
import javax.naming.NoPermissionException;
import javax.naming.PartialResultException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.InvalidSearchFilterException;
import javax.naming.directory.SearchControls;
import javax.naming.directory.SearchResult;
import javax.naming.ldap.Control;
import javax.naming.ldap.InitialLdapContext;
import javax.naming.ldap.LdapContext;
import javax.naming.ldap.PagedResultsControl;
import javax.naming.ldap.PagedResultsResponseControl;

import com.jpromi.inventorycore.entity.LdapSettings;

/**
 * Small JNDI based LDAP client. Spring LDAP is not used on purpose: the connection is
 * configured at runtime from the database and needs an optional trust-all TLS setup.
 */
public final class LdapClient {

    private static final int PAGE_SIZE = 500;

    /** One search hit with its DN and the requested attributes (attribute names in lower case). */
    public record Entry(String dn, Map<String, List<String>> attributes) {
        public String first(String attribute) {
            List<String> values = attributes.get(attribute == null ? "" : attribute.toLowerCase());
            return values == null || values.isEmpty() ? null : values.get(0);
        }

        public List<String> all(String attribute) {
            return attributes.getOrDefault(attribute == null ? "" : attribute.toLowerCase(), List.of());
        }
    }

    private LdapClient() {
    }

    /** Opens a connection as the configured service account. */
    public static LdapContext connect(LdapSettings settings) throws NamingException {
        return connect(settings, settings.getBindDn(), settings.getBindPassword());
    }

    public static LdapContext connect(LdapSettings settings, String principal, String password) throws NamingException {
        Hashtable<String, Object> env = new Hashtable<>();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory");
        env.put(Context.PROVIDER_URL, settings.getUrl());
        env.put(Context.REFERRAL, "ignore");
        env.put("com.sun.jndi.ldap.connect.timeout", "5000");
        env.put("com.sun.jndi.ldap.read.timeout", "15000");
        // binary attributes must not be decoded as text
        env.put("java.naming.ldap.attributes.binary", "objectGUID objectSid thumbnailPhoto jpegPhoto");
        if (principal != null && !principal.isBlank()) {
            env.put(Context.SECURITY_AUTHENTICATION, "simple");
            env.put(Context.SECURITY_PRINCIPAL, principal);
            env.put(Context.SECURITY_CREDENTIALS, password == null ? "" : password);
        } else {
            env.put(Context.SECURITY_AUTHENTICATION, "none");
        }
        if (settings.isIgnoreCertificates() && settings.getUrl() != null && settings.getUrl().toLowerCase().startsWith("ldaps://")) {
            env.put("java.naming.ldap.factory.socket", TrustAllSocketFactory.class.getName());
        }
        return new InitialLdapContext(env, null);
    }

    /**
     * Checks a user's password by binding with the user's DN. Empty passwords are rejected:
     * many servers treat them as anonymous bind and would report success.
     */
    public static boolean verifyPassword(LdapSettings settings, String dn, String password) {
        if (dn == null || dn.isBlank() || password == null || password.isEmpty()) {
            return false;
        }
        try {
            connect(settings, dn, password).close();
            return true;
        } catch (AuthenticationException exception) {
            return false;
        } catch (NamingException exception) {
            throw new IllegalStateException(describe(exception), exception);
        }
    }

    /** Subtree search with paging, so Active Directory returns more than 1000 entries. */
    public static List<Entry> search(LdapContext context, String base, String filter, String... attributes) throws NamingException {
        SearchControls controls = new SearchControls();
        controls.setSearchScope(SearchControls.SUBTREE_SCOPE);
        controls.setReturningAttributes(attributes);

        List<Entry> entries = new ArrayList<>();
        byte[] cookie = null;
        try {
            do {
                context.setRequestControls(new Control[] { new PagedResultsControl(PAGE_SIZE, cookie, Control.NONCRITICAL) });
                NamingEnumeration<SearchResult> results = context.search(base, filter, controls);
                try {
                    while (results.hasMore()) {
                        SearchResult result = results.next();
                        entries.add(new Entry(result.getNameInNamespace(), read(result.getAttributes())));
                    }
                } catch (PartialResultException exception) {
                    // AD/Samba append referrals to other partitions (DomainDnsZones, ...) when searching
                    // from the domain root; with referrals ignored JNDI reports them at the end. Not an error.
                }
                cookie = null;
                Control[] responseControls = context.getResponseControls();
                if (responseControls != null) {
                    for (Control control : responseControls) {
                        if (control instanceof PagedResultsResponseControl paged) {
                            cookie = paged.getCookie();
                        }
                    }
                }
            } while (cookie != null && cookie.length > 0);
        } catch (IOException exception) {
            throw new NamingException("Paging failed: " + exception.getMessage());
        } finally {
            context.setRequestControls(null);
        }
        return entries;
    }

    /** Readable error message for the admin UI. */
    public static String describe(NamingException exception) {
        if (exception instanceof AuthenticationException) {
            return "Anmeldung am LDAP-Server fehlgeschlagen (Bind-DN oder Passwort falsch).";
        }
        if (exception instanceof CommunicationException) {
            Throwable cause = exception.getRootCause();
            if (cause instanceof javax.net.ssl.SSLHandshakeException) {
                return "TLS-Fehler: Zertifikat wird nicht vertraut. Option „Zertifikate ignorieren“ aktivieren oder Zertifikat importieren. ("
                    + cause.getMessage() + ")";
            }
            return "Server nicht erreichbar: " + (cause != null ? cause.getMessage() : exception.getMessage());
        }
        String explanation = exception.getExplanation();
        String detail = explanation != null ? explanation : exception.toString();
        if (exception instanceof NameNotFoundException) {
            return "Suchbasis nicht gefunden: „" + exception.getRemainingName() + "“. Bitte DN prüfen. (" + detail + ")";
        }
        if (exception instanceof InvalidSearchFilterException) {
            return "Ungültiger LDAP-Filter. Klammern und Syntax prüfen. (" + detail + ")";
        }
        if (exception instanceof NoPermissionException || detail.contains("00002020") || detail.contains("without authentication")) {
            return "Keine Berechtigung zum Suchen. Ist der Bind-Benutzer korrekt angemeldet (Passwort gespeichert)? (" + detail + ")";
        }
        return detail;
    }

    private static Map<String, List<String>> read(Attributes attributes) throws NamingException {
        Map<String, List<String>> values = new TreeMap<>();
        if (attributes == null) {
            return values;
        }
        NamingEnumeration<? extends Attribute> all = attributes.getAll();
        while (all.hasMore()) {
            Attribute attribute = all.next();
            // AD returns ranged attributes as "member;range=0-1499"
            String name = attribute.getID().toLowerCase().replaceFirst(";range=.*$", "");
            List<String> list = values.computeIfAbsent(name, key -> new ArrayList<>());
            NamingEnumeration<?> attributeValues = attribute.getAll();
            while (attributeValues.hasMore()) {
                Object value = attributeValues.next();
                if (value instanceof String text) {
                    list.add(text);
                } else if (value instanceof byte[] bytes && (name.equals("thumbnailphoto") || name.equals("jpegphoto"))) {
                    list.add(java.util.Base64.getEncoder().encodeToString(bytes));
                }
            }
        }
        return values;
    }
}
