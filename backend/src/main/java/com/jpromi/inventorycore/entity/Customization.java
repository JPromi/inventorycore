package com.jpromi.inventorycore.entity;

import java.util.UUID;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "customization")
@Getter
@Setter
@NoArgsConstructor
public class Customization {
    @Id
    private Long id = 1L;
    @Column(length = 100)
    private String brandName;
    private String brandColor;
    private String darkBrandColor;
    private Boolean advancedThemeEnabled = false;
    @Column(length = 200)
    private String loginTitle;
    @Column(length = 1000)
    private String loginMessage;
    @Column(length = 2000)
    private String imprintUrl;
    @Column(length = 2000)
    private String privacyUrl;
    @Column(length = 2000)
    private String websiteUrl;
    @Column(length = 2000)
    private String supportUrl;
    @Column(columnDefinition = "bytea")
    private byte[] logo;
    private String logoContentType;
    private UUID logoVersion;
    @Column(columnDefinition = "bytea")
    private byte[] darkLogo;
    private String darkLogoContentType;
    private UUID darkLogoVersion;
}
