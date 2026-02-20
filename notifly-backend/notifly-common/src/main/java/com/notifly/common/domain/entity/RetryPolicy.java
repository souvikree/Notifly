package com.notifly.common.domain.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * Retry policy configuration per tenant and event type
 */
@Entity
@Table(name = "retry_policy", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"tenant_id", "event_type"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RetryPolicy {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String eventType;

    @Column(nullable = false)
    private Integer maxAttempts;  // e.g., 5

    @Column(nullable = false)
    private Long initialDelayMs;  // e.g., 1000 (1 second)

    @Column(nullable = false)
    private Double backoffMultiplier;  // e.g., 5.0 (exponential backoff)

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    @ManyToOne
    @JoinColumn(name = "tenant_id", insertable = false, updatable = false)
    private Tenant tenant;
}
