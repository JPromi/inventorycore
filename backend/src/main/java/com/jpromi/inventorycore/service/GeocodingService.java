package com.jpromi.inventorycore.service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriBuilder;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.jpromi.inventorycore.dto.GeocodingResult;

/**
 * Address search and reverse lookup through Nominatim (OpenStreetMap).
 * Follows the public usage policy: identifying User-Agent, at most one request per second
 * from this instance, and repeated lookups answered from a small cache.
 */
@Service
public class GeocodingService {

    private static final Logger log = LoggerFactory.getLogger(GeocodingService.class);
    private static final int MAX_QUERY_LENGTH = 300;
    private static final int CACHE_SIZE = 500;

    private final RestClient client;
    private final String email;
    private final long minIntervalMillis;
    private final Map<String, Object> cache = Collections.synchronizedMap(new LinkedHashMap<>(16, .75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Object> eldest) {
            return size() > CACHE_SIZE;
        }
    });
    private long lastRequest;

    public GeocodingService(
        RestClient.Builder builder,
        @Value("${app.geocoding.nominatim-url:https://nominatim.openstreetmap.org}") String baseUrl,
        @Value("${app.geocoding.user-agent:InventoryCore (self-hosted inventory management)}") String userAgent,
        @Value("${app.geocoding.email:}") String email,
        @Value("${app.geocoding.min-interval-ms:1000}") long minIntervalMillis
    ) {
        this.client = builder.baseUrl(baseUrl).defaultHeader("User-Agent", userAgent).build();
        this.email = email;
        this.minIntervalMillis = minIntervalMillis;
    }

    /** Throws 400 unless both coordinates are missing or both are within the WGS 84 range. */
    public static void requireValidCoordinates(Double latitude, Double longitude) {
        if (latitude == null && longitude == null) {
            return;
        }
        if (latitude == null || longitude == null || !isValid(latitude, longitude)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid coordinates");
        }
    }

    private static boolean isValid(double latitude, double longitude) {
        return Double.isFinite(latitude) && Double.isFinite(longitude)
            && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }

    /** Places matching a free-text address, best match first (at most five). */
    public List<GeocodingResult> search(String query) {
        String text = query == null ? "" : query.trim();
        if (text.isEmpty() || text.length() > MAX_QUERY_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid address");
        }
        return cached("search:" + text.toLowerCase(), () -> {
            Place[] places = call(uri -> uri.path("/search").queryParam("q", text).queryParam("limit", 5), Place[].class);
            return places == null ? List.<GeocodingResult>of() : Stream.of(places).map(GeocodingService::toResult).filter(Objects::nonNull).toList();
        });
    }

    /** The address at the given coordinates, if there is one. */
    public Optional<GeocodingResult> reverse(double latitude, double longitude) {
        requireValidCoordinates(latitude, longitude);
        // about one meter: nearby clicks/inputs share the cache entry
        String key = String.format(Locale.ROOT, "reverse:%.5f,%.5f", latitude, longitude);
        return cached(key, () -> {
            Place place = call(uri -> uri.path("/reverse").queryParam("lat", latitude).queryParam("lon", longitude).queryParam("zoom", 18), Place.class);
            return Optional.ofNullable(place == null || place.error() != null ? null : toResult(place));
        });
    }

    /** Failed lookups are not cached; the cache is not locked during the request. */
    @SuppressWarnings("unchecked")
    private <T> T cached(String key, Supplier<T> lookup) {
        Object hit = cache.get(key);
        if (hit != null) {
            return (T) hit;
        }
        T result = lookup.get();
        cache.put(key, result);
        return result;
    }

    private <T> T call(Function<UriBuilder, UriBuilder> request, Class<T> type) {
        throttle();
        try {
            return client.get()
                .uri(uri -> {
                    UriBuilder builder = request.apply(uri)
                        .queryParam("format", "jsonv2")
                        .queryParam("addressdetails", 1)
                        .queryParam("accept-language", "de");
                    if (!email.isBlank()) {
                        builder.queryParam("email", email);
                    }
                    return builder.build();
                })
                .retrieve()
                .body(type);
        } catch (RestClientException e) {
            log.warn("Geocoding request failed: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Geocoding service unavailable");
        }
    }

    /** Nominatim allows one request per second; requests from all users of this instance are queued. */
    private synchronized void throttle() {
        long wait = lastRequest + minIntervalMillis - System.currentTimeMillis();
        if (wait > 0) {
            try {
                Thread.sleep(wait);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Interrupted");
            }
        }
        lastRequest = System.currentTimeMillis();
    }

    private static GeocodingResult toResult(Place place) {
        if (place.lat() == null || place.lon() == null) {
            return null;
        }
        try {
            double latitude = Double.parseDouble(place.lat());
            double longitude = Double.parseDouble(place.lon());
            if (!isValid(latitude, longitude)) {
                return null;
            }
            String label = place.displayName() == null ? "" : place.displayName();
            Map<String, String> parts = place.address() == null ? Map.of() : place.address();
            String street = join(" ", first(parts, "road", "pedestrian", "footway", "square", "place"), parts.get("house_number"));
            String postalCode = blankToNull(parts.get("postcode"));
            String city = first(parts, "city", "town", "village", "municipality", "hamlet", "suburb");
            String country = blankToNull(parts.get("country"));
            String address = formatAddress(blankToNull(street), postalCode, city, country);
            return new GeocodingResult(address == null ? label : address, label, blankToNull(street), postalCode, city, country, latitude, longitude);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** "Stephansplatz 1, 1010 Wien, Österreich"; null when all parts are empty. */
    public static String formatAddress(String street, String postalCode, String city, String country) {
        String result = join(", ", street, join(" ", postalCode, city), country);
        return result.isEmpty() ? null : result;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String first(Map<String, String> parts, String... keys) {
        return Stream.of(keys).map(parts::get).filter(value -> value != null && !value.isBlank()).findFirst().orElse(null);
    }

    private static String join(String separator, String... values) {
        return String.join(separator, Stream.of(values).filter(value -> value != null && !value.isBlank()).toList());
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Place(
        String lat,
        String lon,
        @JsonProperty("display_name") String displayName,
        Map<String, String> address,
        String error
    ) {}
}
