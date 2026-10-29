package com.jpromi.inventorycore.repository;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import com.jpromi.inventorycore.entity.NotificationSettings;

public interface NotificationSettingsRepository extends JpaRepository<NotificationSettings, Long> {

}
