package com.jpromi.inventorycore.initializer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.LabelSettings;
import com.jpromi.inventorycore.entity.LabelTemplate;
import com.jpromi.inventorycore.entity.User;
import com.jpromi.inventorycore.enums.Provider;
import com.jpromi.inventorycore.repository.AppUserRepository;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.AssetRepository;
import com.jpromi.inventorycore.repository.AssetTypeRepository;
import com.jpromi.inventorycore.repository.LabelSettingsRepository;
import com.jpromi.inventorycore.repository.LabelTemplateRepository;
import com.jpromi.inventorycore.repository.LocationRepository;

@Component
@Order(1)
public class DataInitializer implements CommandLineRunner {

    private static final String DEFAULT_LABEL_ELEMENTS = """
        [{"id":"code","type":"barcode","x":5,"y":5,"width":19,"height":19,"content":"{invId}","symbology":"qrcode"},{"id":"name","type":"text","x":26,"y":5,"width":31,"height":8,"content":"{name}","fontSize":9,"bold":true,"align":"left"},{"id":"inv","type":"text","x":26,"y":13.5,"width":31,"height":4,"content":"{invId}","fontSize":7,"bold":false,"align":"left"},{"id":"location","type":"text","x":26,"y":18,"width":31,"height":6,"content":"{location}","fontSize":6.5,"bold":false,"align":"left"}]""";

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AreaRepository areaRepository;
    private final AssetRepository assetRepository;
    private final LocationRepository locationRepository;
    private final AssetTypeRepository assetTypeRepository;
    private final LabelTemplateRepository labelTemplateRepository;
    private final LabelSettingsRepository labelSettingsRepository;
    private final com.jpromi.inventorycore.service.AssetStatusService assetStatuses;
    private final com.jpromi.inventorycore.repository.GroupRepository groupRepository;

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
        LabelSettingsRepository labelSettingsRepository,
        com.jpromi.inventorycore.service.AssetStatusService assetStatuses,
        com.jpromi.inventorycore.repository.GroupRepository groupRepository
    ) {
        this.groupRepository = groupRepository;
        this.assetStatuses = assetStatuses;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.areaRepository = areaRepository;
        this.assetRepository = assetRepository;
        this.locationRepository = locationRepository;
        this.assetTypeRepository = assetTypeRepository;
        this.labelTemplateRepository = labelTemplateRepository;
        this.labelSettingsRepository = labelSettingsRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        Area defaultArea = ensureDefaultArea();
        // objects created before areas existed (or without area) belong to the default area
        assetRepository.findWithoutArea().forEach(asset -> asset.getAreas().add(defaultArea));
        locationRepository.findWithoutArea().forEach(location -> location.getAreas().add(defaultArea));
        assetTypeRepository.findWithoutArea().forEach(type -> type.getAreas().add(defaultArea));
        ensureLabelSettings();
        ensureDefaultLabel(defaultArea);
        assetStatuses.ensureBuiltIns();
        ensureEveryoneGroup();
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
            .safeAreaMm(LabelSettings.DEFAULT_SAFE_AREA_MM)
            .elementsJson(DEFAULT_LABEL_ELEMENTS)
            .build());
    }

    /** Label editor defaults (5 mm safe area, common label sizes) that admins can change afterwards. */
    private void ensureLabelSettings() {
        if (!labelSettingsRepository.existsById(LabelSettings.SINGLETON_ID)) {
            labelSettingsRepository.save(new LabelSettings());
        }
    }

    /** The group "Alle Benutzer" (no permissions at first, so nothing changes for existing installations). */
    private void ensureEveryoneGroup() {
        if (groupRepository.findFirstByEveryoneTrue().isPresent()) {
            return;
        }
        groupRepository.save(com.jpromi.inventorycore.entity.Group.builder()
            .name(groupRepository.existsByName("Alle Benutzer") ? "Alle Benutzer (automatisch)" : "Alle Benutzer")
            .sourceProvider(Provider.LOCAL)
            .everyone(true)
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
