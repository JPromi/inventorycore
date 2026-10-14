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
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Value of a check field for one item. Name and type of the field are copied, so the protocol
 * still shows them after the field was changed or removed in the configuration.
 */
@Getter
@Setter
@Entity
@Table(name = "inspection_item_values")
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class InspectionItemValue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inspection_item_id", nullable = false)
    private InspectionItem item;

    /** Uuid of the {@link InspectionFieldDefinition}; no foreign key, the definition may be deleted. */
    @Column(nullable = false)
    private UUID fieldUuid;

    @Column(nullable = false)
    private String fieldName;

    @Enumerated(EnumType.STRING)
    private AssetFieldType fieldType;

    @Column(length = 4000)
    private String value;

    @Builder.Default
    private int sortOrder = 0;
}
