package com.jpromi.inventorycore.dto;

/**
 * One place found by the geocoder: a short postal address for the address field,
 * the full name for choosing between several matches, and WGS 84 coordinates.
 */
public record GeocodingResult(
    String address,
    String label,
    String street,
    String postalCode,
    String city,
    String country,
    double latitude,
    double longitude
) {}
