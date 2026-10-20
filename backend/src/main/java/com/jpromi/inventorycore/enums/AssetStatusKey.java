package com.jpromi.inventorycore.enums;

/** The built-in statuses. They exist in every installation and cannot be changed or deleted. */
public enum AssetStatusKey {
    AVAILABLE("Vorhanden", "#15803d", AssetStatusCategory.ACTIVE),
    IN_DELIVERY("In Lieferung", "#2563eb", AssetStatusCategory.ACTIVE),
    DEFECT("Defekt", "#b62f2f", AssetStatusCategory.DEFECT),
    IN_REPAIR("In Reparatur", "#d97706", AssetStatusCategory.DEFECT),
    MISSING("Nicht auffindbar", "#ca8a04", AssetStatusCategory.MISSING),
    RETIRED("Ausgeschieden", "#78716c", AssetStatusCategory.RETIRED);

    private final String defaultName;
    private final String color;
    private final AssetStatusCategory category;

    AssetStatusKey(String defaultName, String color, AssetStatusCategory category) {
        this.defaultName = defaultName;
        this.color = color;
        this.category = category;
    }

    public String defaultName() {
        return defaultName;
    }

    public String color() {
        return color;
    }

    public AssetStatusCategory category() {
        return category;
    }
}
