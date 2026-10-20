package com.jpromi.inventorycore.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;

/** Public branding only. Logo bytes are served separately. */
public record CustomizationDto(String brandName, String brandColor, String loginTitle, String loginMessage,
    String imprintUrl, String privacyUrl, String websiteUrl, String supportUrl, String logoUrl,
    String darkBrandColor, String darkLogoUrl,
    @JsonSetter(nulls = Nulls.AS_EMPTY) boolean advancedThemeEnabled) {

    public CustomizationDto(String brandName, String brandColor, String loginTitle, String loginMessage,
        String imprintUrl, String privacyUrl, String websiteUrl, String supportUrl, String logoUrl) {
        this(brandName, brandColor, loginTitle, loginMessage, imprintUrl, privacyUrl, websiteUrl, supportUrl,
            logoUrl, null, null, false);
    }
}
