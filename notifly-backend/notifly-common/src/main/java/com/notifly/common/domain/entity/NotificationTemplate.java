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
@Table(name = "notification_templates",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"tenant_id", "name", "version"})
    },
    indexes = {
        @Index(name = "idx_template_tenant_name", columnList = "tenant_id,name"),
        @Index(name = "idx_template_active", columnList = "is_active")
    }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private Integer version = 1;

    @Column(nullable = false)
    private String channel;

    @Column
    private String subject;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    // DB column is "variables jsonb"
    @Column(name = "variables", columnDefinition = "jsonb")
    private String variables;

    // DB column is "is_active" — must match exactly
    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    // DB column is "created_by uuid"
    @Column(name = "created_by", columnDefinition = "uuid")
    private UUID createdBy;

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