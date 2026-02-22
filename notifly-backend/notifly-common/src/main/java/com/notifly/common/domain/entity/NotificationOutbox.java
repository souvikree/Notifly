package com.notifly.common.domain.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notification_outbox",
        indexes = {
                @Index(name = "idx_outbox_status_created", columnList = "status,created_at"),
                @Index(name = "idx_outbox_tenant", columnList = "tenant_id")
        })
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationOutbox {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    // ── DB column is UUID type, not VARCHAR ───────────────────────────────
    // Must declare columnDefinition = "uuid" so Hibernate validation passes.
    // The field stays as String so existing code (OutboxPublisher, NotificationService)
    // that sets aggregateId = requestId.toString() continues to work —
    // Hibernate handles the String→UUID conversion transparently via the
    // @Column(columnDefinition="uuid") hint.
    @Column(name = "aggregate_id", nullable = false, columnDefinition = "uuid")
    private String aggregateId;

    // ── eventPayload is JSONB in the database ─────────────────────────────
    @Column(name = "event_payload", columnDefinition = "jsonb", nullable = false)
    private String eventPayload;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private OutboxStatus status;

    @Column(name = "retry_count")
    private Integer retryCount;

    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

    @Column(name = "sent_at")
    private Instant sentAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Tenant tenant;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID();
        }
        if (this.retryCount == null) {
            this.retryCount = 0;
        }
        this.updatedAt = Instant.now();
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public enum OutboxStatus {
        PENDING,
        SENT,
        FAILED
    }
}