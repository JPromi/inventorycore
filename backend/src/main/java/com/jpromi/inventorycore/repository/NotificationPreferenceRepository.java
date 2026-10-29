package com.jpromi.inventorycore.repository;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import com.jpromi.inventorycore.entity.NotificationPreference;

public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, UUID> {

}
