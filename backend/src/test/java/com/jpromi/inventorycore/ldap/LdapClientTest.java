package com.jpromi.inventorycore.ldap;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import javax.naming.NamingEnumeration;
import javax.naming.PartialResultException;
import javax.naming.directory.SearchControls;
import javax.naming.directory.SearchResult;
import javax.naming.ldap.LdapContext;
import org.junit.jupiter.api.Test;

class LdapClientTest {
    @Test
    void continuationReferencesDoNotAbortSyncAndReturnedEntriesAreKept() throws Exception {
        var context = mock(LdapContext.class);
        @SuppressWarnings("unchecked")
        NamingEnumeration<SearchResult> results = mock(NamingEnumeration.class);
        var entry = mock(SearchResult.class);
        when(entry.getNameInNamespace()).thenReturn("cn=Members,dc=example");
        when(context.search(eq("dc=example"), eq("(objectClass=group)"), any(SearchControls.class))).thenReturn(results);
        when(results.hasMore()).thenReturn(true).thenThrow(new PartialResultException("Unprocessed Continuation Reference(s)"));
        when(results.next()).thenReturn(entry);
        var found = LdapClient.searchComplete(context, "dc=example", "(objectClass=group)", "cn");
        assertEquals(1, found.size());
        assertEquals("cn=Members,dc=example", found.getFirst().dn());
        verify(results).close();
    }

    @Test
    void objectLookupUsesObjectScopeAndOnlyTreatsMissingObjectsAsAbsent() throws Exception {
        var context = mock(LdapContext.class);
        when(context.search(eq("cn=Members,dc=example"), anyString(), any(SearchControls.class)))
            .thenThrow(new javax.naming.NameNotFoundException("removed"));
        assertNull(LdapClient.findObject(context, "cn=Members,dc=example", "(objectClass=group)", "cn"));
        verify(context).search(eq("cn=Members,dc=example"), anyString(),
            argThat((SearchControls controls) -> controls.getSearchScope() == SearchControls.OBJECT_SCOPE));
        when(context.search(eq("cn=Members,dc=example"), anyString(), any(SearchControls.class)))
            .thenThrow(new javax.naming.CommunicationException("offline"));
        assertThrows(javax.naming.CommunicationException.class,
            () -> LdapClient.findObject(context, "cn=Members,dc=example", "(objectClass=group)", "cn"));
    }

    @Test
    void completeSearchRejectsPartialDirectoryResults() throws Exception {
        var context = mock(LdapContext.class);
        @SuppressWarnings("unchecked")
        NamingEnumeration<SearchResult> results = mock(NamingEnumeration.class);
        when(context.search(eq("dc=example"), eq("(objectClass=group)"), any(SearchControls.class))).thenReturn(results);
        when(results.hasMore()).thenThrow(new PartialResultException("missing referral"));
        assertThrows(PartialResultException.class,
            () -> LdapClient.searchComplete(context, "dc=example", "(objectClass=group)", "cn"));
    }
}
