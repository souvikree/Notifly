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
@Table(name = "api_keys", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"tenant_id", "key_prefix"})
}, indexes = {
        @Index(name = "idx_api_key_tenant", columnList = "tenant_id"),
        @Index(name = "idx_api_key_prefix", columnList = "key_prefix")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiKey {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String keyHash;

    @Column(nullable = false)
    private String keyPrefix;

    @Column
    private String displayName;

    @Column(nullable = false)
    private String role;  // "ADMIN" or "SERVICE" — stored as plain varchar in DB

    @Column
    private Instant lastUsedAt;

    @Column(nullable = false)
    @Builder.Default
    private Boolean revoked = false;

    @Column
    private Instant revokedAt;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
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

    public boolean isValid() {
        return (this.revoked == null || !this.revoked) && this.revokedAt == null;
    }

    // Convenience enum for code that needs typed role checks
    public enum ApiKeyRole {
        ADMIN,
        SERVICE
    }
}