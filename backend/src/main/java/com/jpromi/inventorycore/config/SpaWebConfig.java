package com.jpromi.inventorycore.config;

import java.io.IOException;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the Angular app bundled into the JAR (Gradle {@code -PfrontendDist}). Client routes such as
 * {@code /assets/123} get {@code index.html}; backend paths and missing files keep their 404.
 * Without a bundled frontend (development with the Angular dev server) nothing is served here.
 */
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {
    private static final String STATIC = "static/";

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
            .addResourceLocations("classpath:/" + STATIC)
            // file names are hashed except index.html, ngsw.json and the like: always revalidate
            .setCacheControl(CacheControl.noCache())
            .resourceChain(true)
            .addResolver(new PathResourceResolver() {
                @Override
                protected Resource getResource(String resourcePath, Resource location) throws IOException {
                    Resource requested = location.createRelative(resourcePath);
                    if (requested.exists() && requested.isReadable()) {
                        return requested;
                    }
                    if (!isClientRoute(resourcePath)) {
                        return null;
                    }
                    Resource index = new ClassPathResource(STATIC + "index.html");
                    return index.exists() ? index : null;
                }
            });
    }

    /** Paths without a file extension outside the backend's own paths belong to the Angular router. */
    static boolean isClientRoute(String path) {
        String last = path.substring(path.lastIndexOf('/') + 1);
        return !path.startsWith("api/") && !path.equals("api")
            && !path.startsWith("oauth2/") && !path.startsWith("login/oauth2/")
            && !last.contains(".");
    }
}
