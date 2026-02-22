package com.notifly.common.domain.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notification_requests",
        uniqueConstraints = {
                @UniqueConstraint(columnNames = {"tenant_id", "request_id"}),
        },
        indexes = {
                @Index(name = "idx_tenant_request", columnList = "tenant_id,request_id"),
                @Index(name = "idx_tenant_created", columnList = "tenant_id,created_at"),
                @Index(name = "idx_tenant_idempotency", columnList = "tenant_id,idempotency_key")
        })
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationRequest {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    // DB column is UUID type — must declare columnDefinition
    @Column(name = "request_id", nullable = false, columnDefinition = "uuid")
    private UUID requestId;

    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(name = "payload_hash")
    private String payloadHash;

    @Column(columnDefinition = "jsonb", nullable = false)
    private String payload;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(nullable = false)
    @Builder.Default
    private String status = "PENDING";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Tenant tenant;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID();
        }
    }
}