package com.notifly.common.domain.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(
    name = "notification_templates",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"tenant_id", "name", "version"})
    },
    indexes = {
        @Index(name = "idx_template_tenant_name", columnList = "tenant_id,name"),
        @Index(name = "idx_template_active",      columnList = "is_active")
    }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
// Prevent Jackson from choking on Hibernate proxy fields during serialization
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
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

    // variables is jsonb in PostgreSQL.
    // @JdbcTypeCode(SqlTypes.JSON) tells Hibernate 6 to serialize List<String>
    // as a JSON array rather than a raw varchar — no external library needed.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "variables", columnDefinition = "jsonb")
    @Builder.Default
    private List<String> variables = List.of();

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = false;

    @Column(name = "created_by", columnDefinition = "uuid")
    private UUID createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    // ── Tenant relation intentionally removed ──────────────────────────────────
    // The @ManyToOne(fetch=LAZY) proxy gets serialized by Jackson outside of a
    // transaction → LazyInitializationException → 500 on every GET /templates.
    // The tenantId UUID column is all that's needed by any API consumer.
}