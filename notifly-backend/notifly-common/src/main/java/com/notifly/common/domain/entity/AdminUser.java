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
 * Admin user — supports BOTH email/password and Google OAuth.
 *
 * For email users:  passwordHash is set, googleId is null
 * For Google users: googleId is set, passwordHash is null
 * For linked users: both are set (user registered with email, then linked Google)
 *
 * authProvider tracks the ORIGINAL sign-up method.
 */
@Entity
@Table(name = "admin_users", indexes = {
    @Index(name = "idx_admin_tenant_email",   columnList = "tenant_id,email"),
    @Index(name = "idx_admin_google_id",       columnList = "google_id")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUser {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String email;

    // Nullable — Google-only users don't have a password
    @Column
    private String passwordHash;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    // "LOCAL" | "GOOGLE" | "LINKED"
    @Column(nullable = false)
    @Builder.Default
    private String authProvider = "LOCAL";

    // Google's stable user ID (sub field from ID token)
    @Column(unique = true)
    private String googleId;

    // Google profile picture URL (optional, shown in sidebar avatar)
    @Column
    private String avatarUrl;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", insertable = false, updatable = false)
    private Tenant tenant;
}