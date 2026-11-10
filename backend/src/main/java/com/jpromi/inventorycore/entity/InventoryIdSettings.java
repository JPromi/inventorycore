package com.jpromi.inventorycore.entity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
@Getter @Setter @Entity @Table(name = "inventory_id_settings")
public class InventoryIdSettings {
    public static final String DEFAULT_PATTERN = "INV-{random_alphanumeric:10}";
    @Id private Long id = 1L;
    @Column(nullable = false, length = 500)
    private String pattern = DEFAULT_PATTERN;
}
