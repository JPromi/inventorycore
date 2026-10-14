package com.jpromi.inventorycore.initializer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

@Component
@Order(1)
public class DataInitializer implements CommandLineRunner {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AreaRepository areaRepository;
    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;
    private final AssetTypeRepository assetTypeRepository;

    @Value("${app.default-admin.username:admin}")
    private String defaultAdminUsername;

    @Value("${app.default-admin.password:admin123}")
    private String defaultAdminPassword;

    public DataInitializer(
        AppUserRepository userRepository,
        PasswordEncoder passwordEncoder,
        AreaRepository areaRepository,
        AssetRepository assetRepository,
        LocationRepository locationRepository,
        AssetTypeRepository assetTypeRepository
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.areaRepository = areaRepository;
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
        this.assetTypeRepository = assetTypeRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        Area defaultArea = ensureDefaultArea();
        // objects created before areas existed (or without area) belong to the default area
        assetRepository.findWithoutArea().forEach(asset -> asset.getAreas().add(defaultArea));
        locationRepository.findWithoutArea().forEach(location -> location.getAreas().add(defaultArea));
        assetTypeRepository.findWithoutArea().forEach(type -> type.getAreas().add(defaultArea));

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

    private Area ensureDefaultArea() {
        return areaRepository.findFirstByDefaultAreaTrue().orElseGet(() -> areaRepository.save(Area.builder()
            .name(areaRepository.existsByName("Allgemein") ? "Allgemein (Standard)" : "Allgemein")
            .description("Standardbereich für alles ohne eigene Zuordnung")
            .defaultArea(true)
            .build()));
    }
}
