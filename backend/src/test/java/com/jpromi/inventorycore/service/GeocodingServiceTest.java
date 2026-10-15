package com.jpromi.inventorycore.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class GeocodingServiceTest {
    private static final String BASE = "https://nominatim.test";
    private MockRestServiceServer server;
    private GeocodingService service;

    @BeforeEach
    void setup() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        service = new GeocodingService(builder, BASE, "InventoryCore test", "ops@example.org", 0);
    }

    @Test
    void searchSendsPolicyHeadersAndShortensTheAddress() {
        server.expect(ExpectedCount.once(), requestTo(org.hamcrest.Matchers.startsWith(BASE + "/search?q=Stephansplatz%201")))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("User-Agent", "InventoryCore test"))
            .andExpect(queryParam("format", "jsonv2"))
            .andExpect(queryParam("email", "ops@example.org"))
            .andRespond(withSuccess("""
                [{"lat":"48.2085","lon":"16.3721","display_name":"1, Stephansplatz, Innere Stadt, Wien, 1010, Österreich",
                  "address":{"house_number":"1","road":"Stephansplatz","postcode":"1010","city":"Wien","country":"Österreich"}},
                 {"lat":"48.2","lon":"15.62","display_name":"Hauptstraße, St. Pölten, 3100, Österreich",
                  "address":{"road":"Hauptstraße","postcode":"3100","town":"St. Pölten","country":"Österreich"}},
                 {"lat":"not a number","lon":"16","display_name":"broken"}]
                """, MediaType.APPLICATION_JSON));

        var results = service.search(" Stephansplatz 1 ");
        // the same query again comes from the cache (the server expects exactly one call)
        var cached = service.search("stephansplatz 1");

        assertEquals(2, results.size());
        assertEquals("Stephansplatz 1, 1010 Wien, Österreich", results.get(0).address());
        assertEquals("Stephansplatz 1", results.get(0).street());
        assertEquals("1010", results.get(0).postalCode());
        assertEquals("Wien", results.get(0).city());
        assertEquals("Österreich", results.get(0).country());
        // towns without "city" still get a place name
        assertEquals("St. Pölten", results.get(1).city());
        assertEquals("Hauptstraße", results.get(1).street());
        assertEquals(48.2085, results.get(0).latitude());
        assertEquals(16.3721, results.get(0).longitude());
        assertEquals(results, cached);
        server.verify();
    }

    @Test
    void reverseReturnsEmptyWhenNominatimFindsNothing() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith(BASE + "/reverse?lat=0.0&lon=0.0")))
            .andRespond(withSuccess("{\"error\":\"Unable to geocode\"}", MediaType.APPLICATION_JSON));
        assertTrue(service.reverse(0, 0).isEmpty());
    }

    @Test
    void failuresBecomeBadGatewayAndAreNotCached() {
        server.expect(ExpectedCount.twice(), requestTo(org.hamcrest.Matchers.startsWith(BASE + "/search")))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        for (int i = 0; i < 2; i++) {
            var error = assertThrows(ResponseStatusException.class, () -> service.search("Wien"));
            assertEquals(HttpStatus.BAD_GATEWAY, error.getStatusCode());
        }
        server.verify();
    }

    @Test
    void rejectsInvalidInputWithoutCallingNominatim() {
        assertThrows(ResponseStatusException.class, () -> service.search("  "));
        assertThrows(ResponseStatusException.class, () -> service.search("x".repeat(301)));
        assertThrows(ResponseStatusException.class, () -> service.reverse(91, 0));
        server.verify();
    }

    @Test
    void coordinatesMustBeCompleteAndInRange() {
        assertDoesNotThrow(() -> GeocodingService.requireValidCoordinates(null, null));
        assertDoesNotThrow(() -> GeocodingService.requireValidCoordinates(-90.0, 180.0));
        assertThrows(ResponseStatusException.class, () -> GeocodingService.requireValidCoordinates(48.2, null));
        assertThrows(ResponseStatusException.class, () -> GeocodingService.requireValidCoordinates(null, 16.3));
        assertThrows(ResponseStatusException.class, () -> GeocodingService.requireValidCoordinates(90.1, 0.0));
        assertThrows(ResponseStatusException.class, () -> GeocodingService.requireValidCoordinates(0.0, -180.5));
        assertThrows(ResponseStatusException.class, () -> GeocodingService.requireValidCoordinates(Double.NaN, 0.0));
    }

    @Test
    void formatAddressSkipsMissingParts() {
        assertEquals("Hauptstraße 5, 3100 St. Pölten, Österreich", GeocodingService.formatAddress("Hauptstraße 5", "3100", "St. Pölten", "Österreich"));
        assertEquals("Wien, Österreich", GeocodingService.formatAddress(null, " ", "Wien", "Österreich"));
        assertNull(GeocodingService.formatAddress(null, null, "", null));
    }
}
