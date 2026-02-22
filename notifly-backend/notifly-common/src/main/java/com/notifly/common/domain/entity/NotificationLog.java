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
@Table(name = "notification_logs", indexes = {
    @Index(name = "idx_tenant_request_channel", columnList = "tenant_id,request_id,channel"),
    @Index(name = "idx_tenant_created", columnList = "tenant_id,created_at DESC"),
    @Index(name = "idx_status", columnList = "status")
},
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"tenant_id", "request_id", "channel", "retry_attempt"})
    }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    // DB column is UUID type
    @Column(name = "request_id", nullable = false, columnDefinition = "uuid")
    private UUID requestId;

    @Column(nullable = false)
    private String channel;

    @Column(nullable = false)
    private String status;

    @Column(name = "retry_attempt", nullable = false)
    private Integer retryAttempt;

    @Column(name = "provider_latency_ms")
    private Long providerLatencyMs;

    // Both error_message and error_details are TEXT in the DB (confirmed from schema)
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "error_details", columnDefinition = "TEXT")
    private String errorDetails;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", insertable = false, updatable = false)
    private Tenant tenant;
}