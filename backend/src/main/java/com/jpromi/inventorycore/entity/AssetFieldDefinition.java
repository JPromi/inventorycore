package com.jpromi.inventorycore.entity;

import java.util.UUID;

import com.jpromi.inventorycore.enums.AssetFieldType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "asset_field_definitions")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class AssetFieldDefinition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_type_id")
    private AssetType assetType;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String fieldKey;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private AssetFieldType fieldType = AssetFieldType.TEXT;

    @Column(length = 2000)
    private String optionsJson;

    @Column(nullable = false)
    @Builder.Default
    private boolean required = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean typeField = true;

    @Builder.Default
    private int sortOrder = 0;

    @PrePersist
    void ensureUuid() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }
    }
}
