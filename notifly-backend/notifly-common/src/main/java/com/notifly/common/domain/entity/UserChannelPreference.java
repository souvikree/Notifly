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
 * User channel preferences - per-user notification settings
 */
@Entity
@Table(name = "user_channel_preferences", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"tenant_id", "user_id", "channel"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserChannelPreference {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private String channel;

    @Column(nullable = false)
    private Boolean enabled;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    @ManyToOne
    @JoinColumn(name = "tenant_id", insertable = false, updatable = false)
    private Tenant tenant;
}
