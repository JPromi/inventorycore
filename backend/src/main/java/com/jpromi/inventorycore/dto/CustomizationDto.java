package com.jpromi.inventorycore.dto;

/** Public branding only. Logo bytes are served separately. */
public record CustomizationDto(String brandName, String brandColor, String loginTitle, String loginMessage,
    String imprintUrl, String privacyUrl, String websiteUrl, String supportUrl, String logoUrl) {}
