package com.jpromi.inventorycore.service;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.jpromi.inventorycore.entity.InventoryIdSettings;
import com.jpromi.inventorycore.repository.InventoryIdSettingsRepository;

@Service
public class InventoryIdService {
    private static final Pattern TOKEN = Pattern.compile("\\{(random_number|random_letters|random_alphanumeric)(?::([0-9]{1,3}))?}|\\{(year|year_short|date|month|day)}");
    private final SecureRandom random = new SecureRandom();
    private final InventoryIdSettingsRepository settings;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    public InventoryIdService(InventoryIdSettingsRepository settings, org.springframework.jdbc.core.JdbcTemplate jdbc) {
        this.settings = settings;
        this.jdbc = jdbc;
    }
    /** Serialize allocation across instances until the owning write transaction commits. */
    public void lockAllocation() { jdbc.execute("select pg_advisory_xact_lock(731904281)"); }
    public String pattern() { return settings.findById(1L).map(InventoryIdSettings::getPattern).orElse(InventoryIdSettings.DEFAULT_PATTERN); }
    public void validate(String pattern) {
        if (pattern == null || pattern.isBlank() || pattern.length() > 500 || pattern.chars().anyMatch(Character::isISOControl)) invalid();
        var matcher = TOKEN.matcher(pattern);
        boolean hasRandom = false;
        while (matcher.find()) {
            if (matcher.group(1) != null) {
                hasRandom = true;
                int length = matcher.group(2) == null ? 10 : Integer.parseInt(matcher.group(2));
                if (length < 1 || length > 100) invalid();
            }
        }
        String literal = TOKEN.matcher(pattern).replaceAll("");
        if (!hasRandom || literal.contains("{") || literal.contains("}")) invalid();
        if (render(pattern, LocalDate.now()).length() > 255) invalid();
    }
    private static void invalid() {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ungültiges Muster: bekannte Platzhalter, mindestens ein Zufallsplatzhalter mit 1 bis 100 Zeichen und höchstens 255 Ausgabezeichen erforderlich.");
    }
    public String generate(Predicate<String> occupied) { lockAllocation(); return generate(pattern(), occupied); }
    public String generate(String pattern, Predicate<String> occupied) {
        validate(pattern);
        for (int attempt = 0; attempt < 1000; attempt++) {
            String value = render(pattern, LocalDate.now());
            if (!occupied.test(value)) return value;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Keine freie Inventar-ID gefunden. Vergrößern Sie die Länge des Zufallsplatzhalters.");
    }
    String render(String pattern, LocalDate date) {
        var matcher = TOKEN.matcher(pattern);
        return matcher.replaceAll(match -> {
            if (match.group(1) != null) {
                String alphabet = switch (match.group(1)) {
                    case "random_number" -> "0123456789";
                    case "random_letters" -> "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                    default -> "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                };
                int length = match.group(2) == null ? 10 : Integer.parseInt(match.group(2));
                StringBuilder result = new StringBuilder();
                for (int i = 0; i < length; i++) result.append(alphabet.charAt(random.nextInt(alphabet.length())));
                return result.toString();
            }
            return date.format(DateTimeFormatter.ofPattern(switch (match.group(3)) {
                case "year" -> "yyyy";
                case "year_short" -> "yy";
                case "month" -> "MM";
                case "day" -> "dd";
                default -> "yyyyMMdd";
            }));
        });
    }
}
