package com.jpromi.inventorycore.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One entry of the activity log: who did what with which object and when. Names are stored as
 * they were at that moment, so entries stay readable after renames and deletes.
 */
@Getter
@Entity
@Table(name = "audit_logs", indexes = {
    @Index(name = "idx_audit_logs_object", columnList = "objectUuid"),
    @Index(name = "idx_audit_logs_created", columnList = "createdAt")
})
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @Column(nullable = false)
    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();

    /** Null for actions without a logged-in user (e.g. scheduled jobs). */
    private UUID userUuid;
    private String userName;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private AuditAction action;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private AuditObjectType objectType;

    private UUID objectUuid;

    @Column(length = 500)
    private String objectName;

    /** JSON list of {@link com.jpromi.inventorycore.dto.AuditDetail}: field keys, raw values and event codes, no text. */
    @Column(columnDefinition = "text")
    private String details;
}
