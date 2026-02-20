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

/**
 * Notification logs - tracks delivery attempts per channel
 */
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

    @Column(nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private UUID requestId;

    @Column(nullable = false)
    private String channel;  // EMAIL, SMS, PUSH

    @Column(nullable = false)
    private String status;  // SUCCESS, FAILED, PENDING

    @Column(nullable = false)
    private Integer retryAttempt;

    @Column
    private Long providerLatencyMs;

    @Column(columnDefinition = "TEXT")
    private String errorDetails;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    @ManyToOne
    @JoinColumn(name = "tenant_id", insertable = false, updatable = false)
    private Tenant tenant;
}
