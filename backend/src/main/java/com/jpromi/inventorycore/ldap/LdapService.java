package com.jpromi.inventorycore.ldap;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import javax.naming.NamingException;
import javax.naming.ldap.LdapContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.LdapSettings;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.GroupRepository;
import com.jpromi.inventorycore.repository.LdapSettingsRepository;

@Service
public class LdapService {

    private static final Logger log = LoggerFactory.getLogger(LdapService.class);
    private static final int SAMPLE_SIZE = 8;

    public record TestResult(
        boolean success,
        String message,
        Integer userCount,
        Integer groupCount,
        List<String> sampleUsers,
        List<String> sampleGroups,
        List<String> availableGroups,
        String effectiveGroupFilter
    ) {
        public TestResult(boolean success, String message, Integer userCount, Integer groupCount,
            List<String> sampleUsers, List<String> sampleGroups) {
            this(success, message, userCount, groupCount, sampleUsers, sampleGroups, List.of(), null);
        }
    }

    public record SyncResult(
        boolean success,
        String message,
        int usersCreated,
        int usersUpdated,
        int usersDisabled,
        int usersSkipped,
        int groupsCreated,
        int groupsUpdated,
        int groupsDeleted
    ) {}

    private final LdapSettingsRepository settingsRepository;
    private final AppUserRepository userRepository;
    private final GroupRepository groupRepository;

    public LdapService(LdapSettingsRepository settingsRepository, AppUserRepository userRepository, GroupRepository groupRepository) {
        this.settingsRepository = settingsRepository;
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
    }

    /** Connects with the given (possibly unsaved) settings and counts the users and groups the filters find. */
    public TestResult test(LdapSettings settings) {
        if (isBlank(settings.getUrl())) {
            return new TestResult(false, "Bitte eine Server-URL angeben.", null, null, List.of(), List.of());
        }
        if (!isBlank(settings.getBindDn()) && isBlank(settings.getBindPassword())) {
            // an empty password would silently become an anonymous bind
            return new TestResult(false, "Bitte ein Passwort für den Bind-Benutzer angeben.", null, null, List.of(), List.of());
        }
        LdapContext context = null;
        try {
            context = LdapClient.connect(settings);
            List<LdapClient.Entry> users = LdapClient.search(context, userBase(settings), settings.getUserFilter(), settings.getUsernameAttribute());
            List<LdapClient.Entry> groups = LdapClient.search(context, groupBase(settings), settings.getGroupFilter(), settings.getGroupNameAttribute());
            List<LdapClient.Entry> matchingGroups = settings.isRestrictGroups()
                ? LdapClient.search(context, groupBase(settings), settings.effectiveGroupFilter(), settings.getGroupNameAttribute())
                : groups;
            return new TestResult(
                true,
                "Verbindung erfolgreich.",
                users.size(),
                matchingGroups.size(),
                users.stream().map(entry -> entry.first(settings.getUsernameAttribute())).filter(Objects::nonNull).sorted().limit(SAMPLE_SIZE).toList(),
                matchingGroups.stream().map(entry -> entry.first(settings.getGroupNameAttribute())).filter(Objects::nonNull).sorted().limit(SAMPLE_SIZE).toList(),
                groups.stream().map(entry -> entry.first(settings.getGroupNameAttribute())).filter(Objects::nonNull).distinct().sorted().toList(),
                settings.effectiveGroupFilter()
            );
        } catch (NamingException exception) {
            return new TestResult(false, LdapClient.describe(exception), null, null, List.of(), List.of());
        } finally {
            close(context);
        }
    }

    /**
     * Imports users and groups. Only objects that came from LDAP are changed; local and OIDC
     * accounts with the same name are left alone and reported as skipped.
     */
    @Transactional
    public synchronized SyncResult sync() {
        LdapSettings settings = settingsRepository.load();
        if (!settings.isEnabled() || isBlank(settings.getUrl())) {
            return new SyncResult(false, "LDAP ist nicht aktiviert.", 0, 0, 0, 0, 0, 0, 0);
        }

        LdapContext context = null;
        try {
            context = LdapClient.connect(settings);
            List<LdapClient.Entry> userEntries = LdapClient.search(context, userBase(settings), settings.getUserFilter(),
                settings.getUsernameAttribute(), settings.getDisplayNameAttribute(), settings.getEmailAttribute(), "thumbnailPhoto", "jpegPhoto");
            List<LdapClient.Entry> groupEntries = new java.util.ArrayList<>(LdapClient.searchComplete(context, groupBase(settings), settings.effectiveGroupFilter(),
                settings.getGroupNameAttribute(), settings.getGroupMemberAttribute()));
            List<Group> existingGroups = groupRepository.findAll();
            Set<javax.naming.ldap.LdapName> foundDns = new HashSet<>();
            for (LdapClient.Entry entry : groupEntries) {
                foundDns.add(new javax.naming.ldap.LdapName(entry.dn()));
            }
            var searchBase = new javax.naming.ldap.LdapName(groupBase(settings));
            for (Group group : existingGroups) {
                if (group.getSourceProvider() != Provider.LDAP || isBlank(group.getExternalId())) {
                    continue;
                }
                var dn = new javax.naming.ldap.LdapName(group.getExternalId());
                if (!dn.startsWith(searchBase) || foundDns.contains(dn)) {
                    continue;
                }
                LdapClient.Entry verified = LdapClient.findObject(context, group.getExternalId(), settings.effectiveGroupFilter(),
                    settings.getGroupNameAttribute(), settings.getGroupMemberAttribute());
                if (verified != null) {
                    groupEntries.add(verified);
                    foundDns.add(dn);
                }
            }

            SyncResult result = apply(settings, userEntries, groupEntries, existingGroups);
            if (settingsRepository.existsById(LdapSettings.SINGLETON_ID)) {
                settings.setLastSyncAt(OffsetDateTime.now());
                settings.setLastSyncResult(result.message());
                settingsRepository.save(settings);
            }
            log.info("LDAP sync: {}", result.message());
            return result;
        } catch (NamingException exception) {
            return new SyncResult(false, LdapClient.describe(exception), 0, 0, 0, 0, 0, 0, 0);
        } finally {
            close(context);
        }
    }

    /** Password check for users imported from LDAP. */
    public boolean authenticate(User user, String password) {
        LdapSettings settings = settingsRepository.load();
        if (!settings.isEnabled() || !settings.isLoginEnabled() || user.getSourceProvider() != Provider.LDAP) {
            return false;
        }
        return LdapClient.verifyPassword(settings, user.getExternalId(), password);
    }

    private SyncResult apply(LdapSettings settings, List<LdapClient.Entry> userEntries, List<LdapClient.Entry> groupEntries, List<Group> existingGroups) {
        List<User> allUsers = userRepository.findAll();
        Map<String, User> usersByName = new HashMap<>();
        Map<String, User> ldapUsersByDn = new HashMap<>();
        for (User user : allUsers) {
            usersByName.put(lower(user.getUsername()), user);
            if (user.getSourceProvider() == Provider.LDAP && user.getExternalId() != null) {
                ldapUsersByDn.put(lower(user.getExternalId()), user);
            }
        }

        int created = 0;
        int updated = 0;
        int skipped = 0;
        Set<User> seen = new HashSet<>();
        Map<String, User> syncedByDn = new HashMap<>();
        Map<String, User> syncedByName = new HashMap<>();

        for (LdapClient.Entry entry : userEntries) {
            String username = entry.first(settings.getUsernameAttribute());
            if (isBlank(username)) {
                continue;
            }
            User user = ldapUsersByDn.get(lower(entry.dn()));
            if (user == null) {
                User sameName = usersByName.get(lower(username));
                if (sameName != null && sameName.getSourceProvider() != Provider.LDAP) {
                    // never take over local or OIDC accounts
                    skipped++;
                    continue;
                }
                user = sameName;
            }
            String displayName = firstNonBlank(entry.first(settings.getDisplayNameAttribute()), username);
            String email = entry.first(settings.getEmailAttribute());
            if (user == null) {
                user = User.builder()
                    .username(username)
                    .displayName(displayName)
                    .email(email)
                    .role("USER")
                    .enabled(true)
                    .sourceProvider(Provider.LDAP)
                    .externalId(entry.dn())
                    .build();
                usersByName.put(lower(username), user);
                created++;
            } else {
                boolean nameFree = Objects.equals(lower(user.getUsername()), lower(username)) || !usersByName.containsKey(lower(username));
                if (nameFree) {
                    user.setUsername(username);
                }
                user.setDisplayName(displayName);
                user.setEmail(email);
                user.setExternalId(entry.dn());
                user.setEnabled(true);
                updated++;
            }
            String photo = entry.first("thumbnailPhoto");
            if (photo == null) {
                photo = entry.first("jpegPhoto");
            }
            try {
                com.jpromi.inventorycore.service.ProfileImageService.setImage(user,
                    photo == null ? null : java.util.Base64.getDecoder().decode(photo));
            } catch (IllegalArgumentException | org.springframework.web.server.ResponseStatusException exception) {
                log.warn("Invalid LDAP profile image for {}", username);
            }
            seen.add(user);
            syncedByDn.put(lower(entry.dn()), user);
            syncedByName.put(lower(username), user);
        }

        int disabled = 0;
        if (settings.isDisableMissingUsers()) {
            for (User user : allUsers) {
                if (user.getSourceProvider() == Provider.LDAP && !seen.contains(user) && user.isEnabled()) {
                    user.setEnabled(false);
                    disabled++;
                }
            }
        }
        userRepository.saveAll(seen);

        // groups
        Map<String, Group> ldapGroupsByDn = new HashMap<>();
        Map<String, Group> ldapGroupsByName = new HashMap<>();
        Set<Group> existingLdapGroups = new HashSet<>();
        for (Group group : existingGroups) {
            if (group.getSourceProvider() == Provider.LDAP) {
                existingLdapGroups.add(group);
                if (group.getExternalId() != null) {
                    ldapGroupsByDn.put(lower(group.getExternalId()), group);
                }
                ldapGroupsByName.put(lower(group.getName()), group);
            }
        }

        int groupsCreated = 0;
        int groupsUpdated = 0;
        Set<java.util.UUID> seenGroupUuids = new HashSet<>();
        Map<User, Set<Group>> memberships = new HashMap<>();
        seen.forEach(user -> memberships.put(user, new HashSet<>()));

        for (LdapClient.Entry entry : groupEntries) {
            Group group = ldapGroupsByDn.get(lower(entry.dn()));
            if (group != null) {
                seenGroupUuids.add(group.getUuid());
            }
            String name = entry.first(settings.getGroupNameAttribute());
            if (isBlank(name)) {
                continue;
            }
            if (group == null) {
                group = ldapGroupsByName.get(lower(name));
            }
            if (group == null) {
                group = Group.builder().name(name).sourceProvider(Provider.LDAP).externalId(entry.dn()).build();
                groupsCreated++;
            } else {
                group.setName(name);
                group.setExternalId(entry.dn());
                groupsUpdated++;
            }
            group = groupRepository.save(group);
            seenGroupUuids.add(group.getUuid());

            for (String member : entry.all(settings.getGroupMemberAttribute())) {
                // "member" holds DNs, "memberUid" (posixGroup) holds user names
                User user = member.contains("=") ? syncedByDn.get(lower(member)) : syncedByName.get(lower(member));
                if (user != null) {
                    memberships.get(user).add(group);
                }
            }
        }

        // replace only the LDAP groups of LDAP users; local groups stay assigned
        memberships.forEach((user, groups) -> {
            user.getGroups().removeIf(group -> group.getSourceProvider() == Provider.LDAP);
            user.getGroups().addAll(groups);
        });
        userRepository.saveAll(memberships.keySet());

        Set<Group> missingGroups = existingLdapGroups.stream()
            .filter(group -> !seenGroupUuids.contains(group.getUuid()))
            .collect(java.util.stream.Collectors.toSet());
        if (!missingGroups.isEmpty()) {
            // Remove owning-side links for every account, including disabled and external users.
            List<User> affectedUsers = allUsers.stream()
                .filter(user -> user.getGroups().removeAll(missingGroups)).toList();
            userRepository.saveAll(affectedUsers);
            missingGroups.forEach(group -> group.getUsers().clear());
            // Group permissions are removed by the entity's cascade.
            groupRepository.deleteAll(missingGroups);
        }

        String message = String.format(
            "%d Benutzer gefunden (%d neu, %d aktualisiert, %d deaktiviert, %d übersprungen), %d Gruppen (%d neu).",
            userEntries.size(), created, updated, disabled, skipped, groupEntries.size(), groupsCreated
        );
        message += " " + missingGroups.size() + " LDAP-Gruppen geloescht.";
        return new SyncResult(true, message, created, updated, disabled, skipped, groupsCreated, groupsUpdated, missingGroups.size());
    }

    private static String userBase(LdapSettings settings) {
        return firstNonBlank(settings.getUserSearchBase(), settings.getBaseDn());
    }

    private static String groupBase(LdapSettings settings) {
        return firstNonBlank(settings.getGroupSearchBase(), settings.getBaseDn());
    }

    private static void close(LdapContext context) {
        if (context != null) {
            try {
                context.close();
            } catch (NamingException ignored) {
                // nothing to do
            }
        }
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String firstNonBlank(String first, String second) {
        return isBlank(first) ? (second == null ? "" : second) : first;
    }
}
