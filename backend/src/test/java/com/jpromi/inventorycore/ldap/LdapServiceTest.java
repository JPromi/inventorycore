package com.jpromi.inventorycore.ldap;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.naming.ldap.LdapContext;
import org.junit.jupiter.api.Test;

import com.jpromi.inventorycore.entity.LdapSettings;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.repository.LdapSettingsRepository;

class LdapServiceTest {
    @Test
    void verifiesGroupsMissingFromSubtreeResultsAndRetainsThoseStillMatchingTheFilter() throws Exception {
        var fixture = new SyncFixture();
        var existing = Group.builder().name("Members").sourceProvider(Provider.LDAP).externalId("cn=Members,dc=example").build();
        when(fixture.groups.findAll()).thenReturn(List.of(existing));
        when(fixture.groups.save(existing)).thenReturn(existing);
        var account = User.builder().username("local").build();
        account.getGroups().add(existing);
        when(fixture.users.findAll()).thenReturn(List.of(account));
        try (var client = mockStatic(LdapClient.class)) {
            fixture.configure(client);
            client.when(() -> LdapClient.findObject(fixture.context, existing.getExternalId(), fixture.settings.effectiveGroupFilter(), "cn", "member"))
                .thenReturn(new LdapClient.Entry(existing.getExternalId(), Map.of("cn", List.of("Members"))));
            var result = fixture.service.sync();
            assertTrue(result.success());
            assertEquals(0, result.groupsDeleted());
            assertEquals(1, result.groupsUpdated());
            assertTrue(account.getGroups().contains(existing));
            verify(fixture.groups, never()).deleteAll(anyIterable());
        }
    }

    @Test
    void failedDirectVerificationAbortsBeforeAnyChanges() throws Exception {
        var fixture = new SyncFixture();
        var existing = Group.builder().name("Members").sourceProvider(Provider.LDAP).externalId("cn=Members,dc=example").build();
        when(fixture.groups.findAll()).thenReturn(List.of(existing));
        try (var client = mockStatic(LdapClient.class)) {
            fixture.configure(client);
            client.when(() -> LdapClient.findObject(fixture.context, existing.getExternalId(), fixture.settings.effectiveGroupFilter(), "cn", "member"))
                .thenThrow(new javax.naming.PartialResultException("Unprocessed Continuation Reference(s)"));
            assertFalse(fixture.service.sync().success());
            verifyNoInteractions(fixture.users);
            verify(fixture.groups, never()).save(any());
            verify(fixture.groups, never()).deleteAll(anyIterable());
        }
    }

    @Test
    void deletesMissingLdapGroupsAndUnlinksEveryAccountButRetainsOtherProvidersAndRenamedGroups() throws Exception {
        var fixture = new SyncFixture();
        var missing = Group.builder().name("Removed").sourceProvider(Provider.LDAP).externalId("cn=Removed,dc=example").build();
        var renamed = Group.builder().name("OldName").sourceProvider(Provider.LDAP).externalId("cn=Kept,dc=example").build();
        var local = Group.builder().name("Local").sourceProvider(Provider.LOCAL).build();
        var oidc = Group.builder().name("OIDC").sourceProvider(Provider.OIDC).build();
        var accounts = java.util.Arrays.stream(Provider.values()).map(provider -> {
            var user = User.builder().username(provider.name()).sourceProvider(provider).enabled(false).build();
            user.getGroups().addAll(Set.of(missing, local, oidc));
            missing.getUsers().add(user);
            return user;
        }).toList();
        when(fixture.users.findAll()).thenReturn(accounts);
        when(fixture.groups.findAll()).thenReturn(List.of(missing, renamed, local, oidc));
        when(fixture.groups.save(renamed)).thenReturn(renamed);
        var entry = new LdapClient.Entry("cn=Kept,dc=example", Map.of("cn", List.of("NewName")));
        try (var client = mockStatic(LdapClient.class)) {
            fixture.configure(client);
            client.when(() -> LdapClient.searchComplete(fixture.context, "dc=example", fixture.settings.effectiveGroupFilter(), "cn", "member"))
                .thenReturn(List.of(entry));
            var result = fixture.service.sync();
            assertTrue(result.success());
            assertEquals(1, result.groupsDeleted());
            assertEquals(1, result.groupsUpdated());
            assertEquals("NewName", renamed.getName());
            for (User user : accounts) {
                assertEquals(Set.of(local, oidc), user.getGroups());
            }
            assertTrue(missing.getUsers().isEmpty());
            verify(fixture.groups).deleteAll(Set.of(missing));
        }
    }

    @Test
    void retainsAGroupFoundByDnEvenIfItsNameAttributeIsMissing() throws Exception {
        var fixture = new SyncFixture();
        var existing = Group.builder().name("Members").sourceProvider(Provider.LDAP).externalId("cn=Members,dc=example").build();
        when(fixture.groups.findAll()).thenReturn(List.of(existing));
        try (var client = mockStatic(LdapClient.class)) {
            fixture.configure(client);
            client.when(() -> LdapClient.searchComplete(fixture.context, "dc=example", fixture.settings.effectiveGroupFilter(), "cn", "member"))
                .thenReturn(List.of(new LdapClient.Entry(existing.getExternalId(), Map.of())));
            assertEquals(0, fixture.service.sync().groupsDeleted());
            verify(fixture.groups, never()).deleteAll(anyIterable());
        }
    }

    @Test
    void completeEmptyResultDeletesAllLdapGroups() throws Exception {
        var fixture = new SyncFixture();
        var missing = Group.builder().name("Removed").sourceProvider(Provider.LDAP).build();
        when(fixture.groups.findAll()).thenReturn(List.of(missing));
        try (var client = mockStatic(LdapClient.class)) {
            fixture.configure(client);
            var result = fixture.service.sync();
            assertTrue(result.success());
            assertEquals(1, result.groupsDeleted());
            verify(fixture.groups).deleteAll(Set.of(missing));
        }
    }

    @Test
    void failedOrIncompleteSearchDoesNotDeleteGroupsOrChangeUsers() throws Exception {
        for (var failure : List.of(new javax.naming.CommunicationException("offline"),
            new javax.naming.PartialResultException("incomplete"))) {
            var fixture = new SyncFixture();
            try (var client = mockStatic(LdapClient.class)) {
                fixture.configure(client);
                client.when(() -> LdapClient.searchComplete(fixture.context, "dc=example", fixture.settings.effectiveGroupFilter(), "cn", "member"))
                    .thenThrow(failure);
                assertFalse(fixture.service.sync().success());
                verifyNoInteractions(fixture.groups, fixture.users);
            }
        }
    }

    private static class SyncFixture {
        final LdapSettings settings = new LdapSettings();
        final LdapSettingsRepository repository = mock(LdapSettingsRepository.class);
        final AppUserRepository users = mock(AppUserRepository.class);
        final GroupRepository groups = mock(GroupRepository.class);
        final LdapContext context = mock(LdapContext.class);
        final LdapService service = new LdapService(repository, users, groups);

        SyncFixture() {
            settings.setEnabled(true);
            settings.setUrl("ldap://directory.example");
            settings.setBaseDn("dc=example");
            when(repository.load()).thenReturn(settings);
            when(users.findAll()).thenReturn(List.of());
            when(groups.findAll()).thenReturn(List.of());
        }

        void configure(org.mockito.MockedStatic<LdapClient> client) {
            client.when(() -> LdapClient.connect(settings)).thenReturn(context);
            client.when(() -> LdapClient.search(context, "dc=example", settings.getUserFilter(),
                settings.getUsernameAttribute(), settings.getDisplayNameAttribute(), settings.getEmailAttribute(), "thumbnailPhoto", "jpegPhoto"))
                .thenReturn(List.of());
            client.when(() -> LdapClient.searchComplete(context, "dc=example", settings.effectiveGroupFilter(), "cn", "member"))
                .thenReturn(List.of());
        }
    }

    @Test
    void groupFilterEscapesNamesAndSupportsEmptySelection() {
        var settings = new LdapSettings();
        assertEquals("(objectClass=group)", settings.effectiveGroupFilter());
        settings.setRestrictGroups(true);
        assertEquals("(!(objectClass=*))", settings.effectiveGroupFilter());
        settings.setSelectedGroupNames(Set.of("Members*(West)\\"));
        assertEquals("(&(objectClass=group)(|(cn=Members\\2a\\28West\\29\\5c)))", settings.effectiveGroupFilter());
    }

    @Test
    void testOffersAllGroupsWhileCountingOnlySelectedMatches() throws Exception {
        var settings = new LdapSettings();
        settings.setUrl("ldap://directory.example");
        settings.setBaseDn("dc=example");
        settings.setRestrictGroups(true);
        settings.setSelectedGroupNames(Set.of("Members"));
        var context = mock(LdapContext.class);
        var memberGroup = new LdapClient.Entry("cn=Members,dc=example", Map.of("cn", List.of("Members")));
        var otherGroup = new LdapClient.Entry("cn=Other,dc=example", Map.of("cn", List.of("Other")));
        try (var client = mockStatic(LdapClient.class)) {
            client.when(() -> LdapClient.connect(settings)).thenReturn(context);
            client.when(() -> LdapClient.search(context, "dc=example", settings.getUserFilter(), settings.getUsernameAttribute())).thenReturn(List.of());
            client.when(() -> LdapClient.search(context, "dc=example", settings.getGroupFilter(), "cn")).thenReturn(List.of(memberGroup, otherGroup));
            client.when(() -> LdapClient.search(context, "dc=example", settings.effectiveGroupFilter(), "cn")).thenReturn(List.of(memberGroup));
            var service = new LdapService(mock(LdapSettingsRepository.class), mock(AppUserRepository.class), mock(GroupRepository.class));
            var result = service.test(settings);
            assertTrue(result.success());
            assertEquals(1, result.groupCount());
            assertEquals(List.of("Members", "Other"), result.availableGroups());
            assertEquals(List.of("Members"), result.sampleGroups());
            verify(context).close();
        }
    }

    @Test
    void syncUsesUsernameForMissingOrBlankDisplayNameAndTheSelectedGroupFilter() throws Exception {
        var settings = new LdapSettings();
        settings.setEnabled(true);
        settings.setUrl("ldap://directory.example");
        settings.setBaseDn("dc=example");
        settings.setRestrictGroups(true);
        settings.setSelectedGroupNames(Set.of("Members"));
        var repository = mock(LdapSettingsRepository.class);
        var users = mock(AppUserRepository.class);
        var groups = mock(GroupRepository.class);
        when(repository.load()).thenReturn(settings);
        when(users.findAll()).thenReturn(List.of());
        when(groups.findAll()).thenReturn(List.of());
        var context = mock(LdapContext.class);
        var entries = List.of(
            new LdapClient.Entry("cn=alice,dc=example", Map.of("samaccountname", List.of("alice"))),
            new LdapClient.Entry("cn=bob,dc=example", Map.of("samaccountname", List.of("bob"), "displayname", List.of("   ")))
        );
        try (var client = mockStatic(LdapClient.class)) {
            client.when(() -> LdapClient.connect(settings)).thenReturn(context);
            client.when(() -> LdapClient.search(context, "dc=example", settings.getUserFilter(),
                settings.getUsernameAttribute(), settings.getDisplayNameAttribute(), settings.getEmailAttribute(), "thumbnailPhoto", "jpegPhoto"))
                .thenReturn(entries);
            client.when(() -> LdapClient.searchComplete(context, "dc=example", settings.effectiveGroupFilter(), "cn", "member")).thenReturn(List.of());
            var result = new LdapService(repository, users, groups).sync();
            assertTrue(result.success());
            assertEquals(2, result.usersCreated());
            verify(users, atLeastOnce()).saveAll(argThat(values -> {
                int count = 0;
                for (User user : values) {
                    assertEquals(user.getUsername(), user.getDisplayName());
                    count++;
                }
                return count == 2;
            }));
            client.verify(() -> LdapClient.searchComplete(context, "dc=example", settings.effectiveGroupFilter(), "cn", "member"));
        }
    }
}
