package com.jpromi.inventorycore.controller;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AppInfoController {
    private final AppInfo response;

    public AppInfoController(ObjectProvider<BuildProperties> buildProperties) {
        BuildProperties build = buildProperties.getIfAvailable();
        response = new AppInfo("InventoryCore", build == null ? "development" : build.getVersion(),
            "https://github.com/JPromi/inventorycore");
    }

    @GetMapping("/api/app-info")
    public AppInfo get() {
        return response;
    }

    public record AppInfo(String name, String version, String githubUrl) {}
}
