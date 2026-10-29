package com.jpromi.inventorycore.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Task;

public interface TaskRepository extends JpaRepository<Task, Long> {
    Optional<Task> findByUuid(UUID uuid);

    /** Active tasks whose next run is due (candidates for the scheduler). */
    List<Task> findByActiveTrueAndNextDueDateLessThanEqual(LocalDate date);

    @Modifying
    @Query("update Task t set t.area = :replacement where t.area = :area")
    void moveArea(@Param("area") Area area, @Param("replacement") Area replacement);
}
