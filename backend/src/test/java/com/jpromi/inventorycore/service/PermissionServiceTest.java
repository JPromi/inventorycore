package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.jpromi.inventorycore.entity.Group;
import com.jpromi.inventorycore.entity.GroupPermission;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.GroupPermissionRepository;
import com.jpromi.inventorycore.repository.GroupRepository;

class PermissionServiceTest {

    private final GroupPermissionRepository permissions = mock(GroupPermissionRepository.class);
    private final GroupRepository groups = mock(GroupRepository.class);
    private final PermissionService service = new PermissionService(mock(AppUserRepository.class), permissions, groups);

    private final Group everyone = Group.builder().id(1L).name("Alle Benutzer").everyone(true).build();
    private final Group atemschutz = Group.builder().id(2L).name("Atemschutzgerätewarte").build();

    @SuppressWarnings("unchecked")
    private List<Group> askedGroups() {
        ArgumentCaptor<List<Group>> asked = ArgumentCaptor.forClass(List.class);
        verify(permissions).findByGroupIn(asked.capture());
        return asked.getValue();
    }

    @Test
    void everyUserGetsThePermissionsOfTheGroupOfAllUsers() {
        when(groups.findFirstByEveryoneTrue()).thenReturn(Optional.of(everyone));
        GroupPermission read = GroupPermission.builder().group(everyone).canView(true).build();
        when(permissions.findByGroupIn(any())).thenReturn(List.of(read));

        User withoutGroups = User.builder().username("neu").groups(new HashSet<>()).build();

        assertEquals(List.of(read), service.permissionsOf(withoutGroups));
        assertEquals(List.of(everyone), askedGroups());
    }

    @Test
    void ownGroupsAndTheGroupOfAllUsersCount() {
        when(groups.findFirstByEveryoneTrue()).thenReturn(Optional.of(everyone));
        User member = User.builder().username("gwart").groups(new HashSet<>(Set.of(atemschutz))).build();

        service.permissionsOf(member);

        assertEquals(Set.of(atemschutz, everyone), Set.copyOf(askedGroups()));
    }

    @Test
    void withoutTheGroupNothingIsAdded() {
        when(groups.findFirstByEveryoneTrue()).thenReturn(Optional.empty());
        User withoutGroups = User.builder().username("neu").groups(new HashSet<>()).build();

        assertTrue(service.permissionsOf(withoutGroups).isEmpty());
        verify(permissions, never()).findByGroupIn(any());
    }
}
