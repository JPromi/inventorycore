package com.jpromi.inventorycore.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import com.jpromi.inventorycore.service.NotificationService;

@Configuration
@EnableScheduling
public class NotificationScheduling {
    @Bean
    @Order(2)
    CommandLineRunner initializeNotificationSettings(NotificationService service) {
        return args -> service.settings();
    }
}
