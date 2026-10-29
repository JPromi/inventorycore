package com.jpromi.inventorycore.service;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Creates the runs of tasks on their due date; checks every 15 minutes, starting shortly after startup. */
@Component
public class TaskScheduler {
    private static final Logger log = LoggerFactory.getLogger(TaskScheduler.class);

    private final TaskService service;

    public TaskScheduler(TaskService service) {
        this.service = service;
    }

    @Scheduled(initialDelay = 45000, fixedDelay = 900000)
    public void run() {
        for (UUID task : service.dueTasks()) {
            try {
                service.createDueRun(task);
            } catch (Exception e) {
                log.warn("Creating the run of task {} failed ({})", task, e.getClass().getSimpleName());
            }
        }
    }
}
