package com.jpromi.inventorycore.initializer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.LabelTemplate;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LabelTemplateRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

@Component
@Order(1)
public class DataInitializer implements CommandLineRunner {

    private static final String DEFAULT_LABEL_ELEMENTS = """
        [{"id":"code","type":"barcode","x":1.5,"y":1.5,"width":26,"height":26,"content":"{invId}","symbology":"qrcode"},{"id":"name","type":"text","x":30,"y":2,"width":30,"height":11,"content":"{name}","fontSize":10,"bold":true,"align":"left"},{"id":"inv","type":"text","x":30,"y":14,"width":30,"height":5,"content":"{invId}","fontSize":8,"bold":false,"align":"left"},{"id":"location","type":"text","x":30,"y":20,"width":30,"height":7,"content":"{location}","fontSize":7,"bold":false,"align":"left"}]""";

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AreaRepository areaRepository;
    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LabelTemplateRepository labelTemplateRepository;
    private final com.jpromi.inventorycore.service.AssetStatusService assetStatuses;

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
        AssetTypeRepository assetTypeRepository,
        LabelTemplateRepository labelTemplateRepository,
        com.jpromi.inventorycore.service.AssetStatusService assetStatuses
    ) {
        this.assetStatuses = assetStatuses;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.areaRepository = areaRepository;
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.labelTemplateRepository = labelTemplateRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        Area defaultArea = ensureDefaultArea();
        // objects created before areas existed (or without area) belong to the default area
        assetRepository.findWithoutArea().forEach(asset -> asset.getAreas().add(defaultArea));
        locationRepository.findWithoutArea().forEach(location -> location.getAreas().add(defaultArea));
        assetTypeRepository.findWithoutArea().forEach(type -> type.getAreas().add(defaultArea));
        ensureDefaultLabel(defaultArea);
        assetStatuses.ensureBuiltIns();
        // assets from before statuses existed are simply there
        var available = assetStatuses.builtIn(com.jpromi.inventorycore.enums.AssetStatusKey.AVAILABLE);
        assetRepository.findWithoutStatus().forEach(asset -> asset.setStatus(available));

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

    /** Without any template printing would not work, so a simple 62 x 29 mm label is the fallback. */
    private void ensureDefaultLabel(Area defaultArea) {
        if (labelTemplateRepository.count() > 0) {
            return;
        }
        labelTemplateRepository.save(LabelTemplate.builder()
            .name("Standard-Label 62 x 29 mm")
            .description("QR-Code mit Inventar-ID, Name und Standort")
            .area(defaultArea)
            .defaultForArea(true)
            .widthMm(62)
            .heightMm(29)
            .elementsJson(DEFAULT_LABEL_ELEMENTS)
            .build());
    }

    private Area ensureDefaultArea() {
        return areaRepository.findFirstByDefaultAreaTrue().orElseGet(() -> areaRepository.save(Area.builder()
            .name(areaRepository.existsByName("Allgemein") ? "Allgemein (Standard)" : "Allgemein")
            .description("Standardbereich für alles ohne eigene Zuordnung")
            .defaultArea(true)
            .build()));
    }
}
