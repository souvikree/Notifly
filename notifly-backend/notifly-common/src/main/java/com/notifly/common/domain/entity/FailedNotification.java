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
@Table(name = "failed_notifications", indexes = {
    @Index(name = "idx_failed_tenant", columnList = "tenant_id"),
    @Index(name = "idx_failed_created", columnList = "created_at DESC")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FailedNotification {

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

    @Column(columnDefinition = "TEXT")
    private String recipient;

    @Column(name = "retry_attempt", nullable = false)
    @Builder.Default
    private Integer retryAttempt = 0;

    @Column(name = "error_code")
    private String errorCode;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    // DB column is JSONB — stored as String, Hibernate maps via columnDefinition
    @Column(name = "error_details", columnDefinition = "jsonb")
    private String errorDetails;

    // DB column is UUID type
    @Column(name = "notification_log_id", columnDefinition = "uuid")
    private UUID notificationLogId;

    @Column(name = "manual_retry_attempted")
    @Builder.Default
    private Boolean manualRetryAttempted = false;

    @Column(name = "manual_retry_count")
    @Builder.Default
    private Integer manualRetryCount = 0;

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