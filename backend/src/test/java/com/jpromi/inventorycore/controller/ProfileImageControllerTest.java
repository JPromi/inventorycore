package com.jpromi.inventorycore.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Optional;
import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.files.ImageProcessor;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.service.ApiMapper;

class ProfileImageControllerTest {
    private final AppUserRepository users = mock(AppUserRepository.class);
    private final ProfileImageController controller = new ProfileImageController(users, new ApiMapper());
    private final UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken("member", null);

    @Test
    void externalAccountsCannotUploadOrDeleteEvenWithAnExistingImage() {
        for (Provider provider : new Provider[] { Provider.LDAP, Provider.OIDC }) {
            User user = User.builder().username("member").sourceProvider(provider).build();
            when(users.findByUsername("member")).thenReturn(Optional.of(user));
            var file = new MockMultipartFile("file", "photo.png", "image/png", new byte[] { 1 });
            assertEquals(HttpStatus.FORBIDDEN,
                assertThrows(ResponseStatusException.class, () -> controller.upload(authentication, file)).getStatusCode());
            assertEquals(HttpStatus.FORBIDDEN,
                assertThrows(ResponseStatusException.class, () -> controller.delete(authentication)).getStatusCode());
        }
        verify(users, never()).save(any());
    }

    @Test
    void localUploadIsResizedAndDeliveredAndCanBeRemoved() throws Exception {
        User user = User.builder().username("member").sourceProvider(Provider.LOCAL).build();
        when(users.findByUsername("member")).thenReturn(Optional.of(user));
        when(users.findByUuid(user.getUuid())).thenReturn(Optional.of(user));
        when(users.save(user)).thenReturn(user);
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB), "png", bytes);
        var file = new MockMultipartFile("file", "photo.png", "image/png", bytes.toByteArray());
        var response = controller.upload(authentication, file);
        assertTrue(response.profileImageUrl().startsWith("/api/profile-images/" + user.getUuid()));
        assertEquals(400, ImageProcessor.read(user.getProfileImage()).getWidth());
        assertArrayEquals(user.getProfileImage(), controller.image(user.getUuid()).getBody());
        assertNull(controller.delete(authentication).profileImageUrl());
        assertEquals(HttpStatus.NOT_FOUND,
            assertThrows(ResponseStatusException.class, () -> controller.image(user.getUuid())).getStatusCode());
    }

    @Test
    void invalidImageDoesNotOverwriteTheExistingPhoto() {
        User user = User.builder().username("member").profileImageUrl("https://example.org/photo").build();
        when(users.findByUsername("member")).thenReturn(Optional.of(user));
        var file = new MockMultipartFile("file", "photo.png", "image/png", new byte[] { 1, 2, 3 });
        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
            assertThrows(ResponseStatusException.class, () -> controller.upload(authentication, file)).getStatusCode());
        assertEquals("https://example.org/photo", user.profileImageLocation());
        verify(users, never()).save(any());
    }
}
