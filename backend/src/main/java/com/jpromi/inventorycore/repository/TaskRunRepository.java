package com.jpromi.inventorycore.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.Task;
import com.jpromi.inventorycore.entity.TaskRun;
import com.jpromi.inventorycore.enums.TaskRunStatus;

public interface TaskRunRepository extends JpaRepository<TaskRun, Long> {
    Optional<TaskRun> findByUuid(UUID uuid);

    List<TaskRun> findAllByOrderByDueDateDescCreatedAtDesc();

    List<TaskRun> findByTaskOrderByDueDateDesc(Task task);

    boolean existsByTaskAndStatus(Task task, TaskRunStatus status);

    List<TaskRun> findByTaskAndStatus(Task task, TaskRunStatus status);

    /** Protocols keep their own texts, so a task can be deleted without touching them. */
    @Modifying
    @Query("update TaskRun r set r.task = null where r.task = :task")
    void detachTask(@Param("task") Task task);

    @Modifying
    @Query("update TaskRun r set r.area = :replacement where r.area = :area")
    void moveArea(@Param("area") Area area, @Param("replacement") Area replacement);
}
