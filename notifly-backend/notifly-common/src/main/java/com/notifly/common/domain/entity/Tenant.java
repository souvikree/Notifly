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
@Table(name = "tenants")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Tenant {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(nullable = false, unique = true)
    private String slug;

    /**
     * Plan tier — controls rate limits and feature access.
     * FREE       → 10,000  requests/month, 60  req/min
     * STARTER    → 100,000 requests/month, 300 req/min
     * PRO        → 1,000,000 requests/month, 1000 req/min
     * ENTERPRISE → unlimited
     */
    @Column(nullable = false)
    @Builder.Default
    private String plan = "FREE";

    /**
     * Hard monthly cap enforced by the rate limiter.
     * Auto-set on signup based on plan.
     */
    @Column(nullable = false)
    @Builder.Default
    private Integer monthlyRequestLimit = 10000;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID();
        }
    }
}