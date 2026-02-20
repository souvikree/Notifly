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
@Table(name = "notification_requests",
        uniqueConstraints = {
                @UniqueConstraint(columnNames = {"tenant_id", "request_id"}),
                @UniqueConstraint(columnNames = {"tenant_id", "idempotency_key"})
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

    @Column(nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String requestId;

    @Column(nullable = false)
    private String idempotencyKey;

    @Column(nullable = false)
    private String payloadHash;

    @Column(columnDefinition = "JSONB", nullable = false)
    private String payload;

    @Column(nullable = false)
    private String eventType;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private String recipientAddress;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

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
