package com.jpromi.inventorycore.initializer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;

@Component
public class DataInitializer implements CommandLineRunner {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.default-admin.username:admin}")
    private String defaultAdminUsername;

    @Value("${app.default-admin.password:admin123}")
    private String defaultAdminPassword;

    public DataInitializer(AppUserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (!userRepository.existsByUsername(defaultAdminUsername)) {
            User admin = User.builder()
                    .username(defaultAdminUsername)
                    .password(passwordEncoder.encode(defaultAdminPassword))
                    .displayName("Administrator")
                    .role("ADMIN")
                    .enabled(true)
                    .email(defaultAdminUsername + "@inventorycore.test")
                    .sourceProvider(Provider.LOCAL)
                    .build();
            userRepository.save(admin);
        }
    }
}
